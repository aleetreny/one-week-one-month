# AI Speeds the Work, Not the Wait

**Alejandro Treny Ortega** · November 2026

A one-page research note on AI and scientific discovery, written for Lukas Althoff's pre-doctoral research task (Stanford), using the public [SciNet](https://www.anatomyofscience.com) database of research tasks.

**[Read the paper (PDF)](paper/the_waiting_is_the_hardest_part_two_columns.pdf)** · **[Interactive version](https://aleetreny.github.io/one-week-one-month/)** · **[Replication code](replication/)**

## The finding

Every research task takes time in two ways: the hands-on hours people spend on it, and the waiting, for a crystal to grow, for patients to sign up, for an archive to reply. SciNet estimates both for the 6,666 tasks that go into research papers across 318 subfields, and rates how likely a frontier AI system is to do each task.

- The research tasks AI does worst are the ones that wait. Among tasks with about 50 hours of hands-on work, typical waiting rises from **22 hours** for the fifth AI does best to **31 days** for the fifth it does worst.
- Across all tasks, the fifth AI does best waits a median of **4 hours**; the fifth it does worst, **a month**. Those worst tasks hold a third of all hands-on work in science but **half of all the waiting**.
- The first verb of a task says why: *fit*, *calculate* and *process* wait hours; *obtain*, *recruit*, *negotiate* and *coordinate* wait one to three months, because they depend on samples, permits and people.

AI can speed up the hands-on part of research. The waiting stays, and it sits exactly where AI helps least.

## What is in this repository

| Folder | Contents |
|---|---|
| [`paper/`](paper/) | The one-page note (PDF) |
| [`replication/`](replication/) | `replicate.py` reproduces every number and figure from SciNet v1.10.0 (pinned commit), with robustness checks; see its [README](replication/README.md) |
| [`docs/`](docs/) | The interactive site, served at [aleetreny.github.io/one-week-one-month](https://aleetreny.github.io/one-week-one-month/) |
| [`web/`](web/) | Script that builds the site's data from SciNet |

## Data

SciNet: Alamos, C. and Althoff, L. (2026), *SciNet: The Anatomy of Science* [dataset], [github.com/lukasalthoff/scinet](https://github.com/lukasalthoff/scinet). All times and AI ratings are SciNet's model-based estimates; the relationships are associations across tasks.
