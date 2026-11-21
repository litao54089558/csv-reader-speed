// A faster drop-in for csv-reader 1.0.0 (make.fun's own reference program): run(input) returns, for
// every case's input {text, header}, exactly the answer readCsv returns: {columns, rows, errors}.
//
// The reference reads one character at a time and builds each field a character at a time. This
// reader does the same reading, but in bulk: an unquoted field is taken with one scan for its next
// comma or line break and one slice, and a quoted field is taken by searching for its closing
// quote with indexOf and slicing its body once. The only per-character work left is counting the line
// breaks inside a quoted field (which the next record's start line needs) and the rare broken-field
// paths (a stray CR inside an unquoted field, a doubled quote or a CR inside a quoted field).
//
// The policy is the reference's, kept exactly (see the house baseline's vendor/csv-reader/index.js):
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled, "" inside it one
//     quote, and each CRLF or lone CR inside it is read as LF; what follows its closing quote, up to
//     the next comma or line break, is appended to it as it stands (quote_junk, when the field ends);
//     a quote that never closes is read as a literal character and the text after it is read again as
//     an unquoted field (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings, never trimmed;
//   - columns is the first record when header is true, else null; rows holds the records after it
//     (every record when header is false), each padded with "" (short_row, with fields: its count)
//     or cut (long_row, with extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line its record starts on (every LF, CRLF
//     and lone CR inside a quoted field counted), row its record's index in rows (null for the
//     header), in the order met, a field's quote_junk when the field ends and a record's short_row
//     or long_row when the record ends.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to the next.

/** How a field ended: 0 at a comma (the record goes on), 1 at a line break, 2 at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  const n = text.length;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The field just read, written by readUnquoted/readQuoted instead of returned, so no object is
  // made per field: fValue its string, fEnded how it ended (COMMA, LINE_BREAK or END).
  let fValue = '';
  let fEnded = END;

  // Reads unquoted characters from pos onto `head` up to the next comma or line break: a CR not
  // followed by LF is dropped (stray_cr). `head` is '' for a fresh field, or a quoted field's value
  // when what follows its closing quote is read (quote_junk counts the characters kept here).
  // The field's end is found by scanning its characters (a tight charCodeAt loop, no match object
  // per field), and the field is taken with one slice per run of ordinary characters.
  function readUnquoted(head) {
    let value = head;
    let start = pos;
    let i = start;
    for (;;) {
      while (i < n) {
        const c = text.charCodeAt(i);
        if (c === 44 || c === 10 || c === 13) break;
        i++;
      }
      if (i >= n) {
        if (start < n) value = value === '' ? text.slice(start) : value + text.slice(start);
        pos = n;
        fValue = value;
        fEnded = END;
        return;
      }
      const c = text.charCodeAt(i);
      if (c === 44) {
        // ','
        if (start < i) value = value === '' ? text.slice(start, i) : value + text.slice(start, i);
        pos = i + 1;
        fValue = value;
        fEnded = COMMA;
        return;
      }
      if (c === 10) {
        // '\n'
        if (start < i) value = value === '' ? text.slice(start, i) : value + text.slice(start, i);
        pos = i + 1;
        line += 1;
        fValue = value;
        fEnded = LINE_BREAK;
        return;
      }
      // '\r': a CRLF ends the field as one line break, a lone CR is dropped (stray_cr).
      if (text.charCodeAt(i + 1) === 10) {
        if (start < i) value = value === '' ? text.slice(start, i) : value + text.slice(start, i);
        pos = i + 2;
        line += 1;
        fValue = value;
        fEnded = LINE_BREAK;
        return;
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      if (start < i) value = value === '' ? text.slice(start, i) : value + text.slice(start, i);
      start = i + 1;
      i = start;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    // The closing quote: the first '"' not followed by another '"'.
    let i = open + 1;
    let close = -1;
    for (;;) {
      const q = text.indexOf('"', i);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === 34) {
        i = q + 2;
        continue;
      }
      close = q;
      break;
    }
    if (close === -1) {
      // The quote never closes: it is a literal character, and the text after it is read again as
      // an unquoted field (unterminated_quote). The line goes back to the quote's own line, since
      // the scan above did not count the line breaks inside.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      readUnquoted('"');
      return;
    }
    const content = text.slice(open + 1, close);
    let value;
    if (content.indexOf('"') === -1 && content.indexOf('\r') === -1) {
      // No doubled quote and no CR: the body is the value as it stands; only its LFs count.
      value = content;
      let nl = 0;
      for (let k = 0; k < content.length; k++) if (content.charCodeAt(k) === 10) nl++;
      line += nl;
    } else {
      // A doubled quote is one quote, and each CRLF or lone CR is one LF, each counting a line.
      let out = '';
      let nl = 0;
      let k = 0;
      const m = content.length;
      while (k < m) {
        const ch = content.charCodeAt(k);
        if (ch === 34) {
          out += '"';
          k += 2;
          continue;
        }
        if (ch === 13) {
          out += '\n';
          nl++;
          k += content.charCodeAt(k + 1) === 10 ? 2 : 1;
          continue;
        }
        if (ch === 10) nl++;
        const start = k;
        k++;
        while (k < m) {
          const c2 = content.charCodeAt(k);
          if (c2 === 34 || c2 === 13 || c2 === 10) break;
          k++;
        }
        out += content.slice(start, k);
      }
      value = out;
      line += nl;
    }
    pos = close + 1;
    if (pos >= n) {
      fValue = value;
      fEnded = END;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fValue = value;
      fEnded = COMMA;
      return;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fValue = value;
      fEnded = LINE_BREAK;
      return;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fValue = value;
      fEnded = LINE_BREAK;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    readUnquoted(value);
    if (fValue.length > value.length) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fValue);
    } while (fEnded === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
