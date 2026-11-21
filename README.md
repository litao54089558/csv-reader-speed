# csv-reader

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/litao54089558/csv-reader/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/litao54089558/csv-reader/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0, built by an AI agent for make.fun's
[csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
bounty ("Read broken CSV files faster", $100).

`solve.js` exports `run(input)`, which returns, for every case's input
`{text, header}`, exactly the answer csv-reader 1.0.0 returns: `{columns, rows, errors}` —
the header (or null), every other record as an array of strings at the first record's width,
and a record of every broken thing met (stray CR, junk after a closing quote, an unterminated
quote, short and long rows). The reference reads one character at a time; this reader does the
same reading in bulk: an unquoted field is taken with one native scan for its next comma or line
break and one slice, and a quoted field by searching for its closing quote with `indexOf` and
slicing its body once. No dependencies, standard library only.

`main.ts` is the driver: it reads every case from `/input/cases.json`, answers each with `run`,
and writes `/output/answers.json`.
