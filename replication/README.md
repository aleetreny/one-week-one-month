# Replication: *The Waiting Is the Hardest Part: AI and the Slow Side of Science*

Alejandro Treny Ortega, November 2026. One-page note written for Lukas Althoff's pre-doctoral research task.

This folder reproduces every number and figure in the note from the public **SciNet** release
(Alamos and Althoff 2026, [github.com/lukasalthoff/scinet](https://github.com/lukasalthoff/scinet)).

## Run it

```bash
pip install -r requirements.txt
python replicate.py                       # clones SciNet at the pinned commit into ./scinet
python replicate.py --scinet /path/to/scinet   # or use an existing checkout
```

Runs in under a minute. Outputs go to `output/`:

| File | What it is |
|---|---|
| `numbers.json` | Every number quoted in the note, plus robustness checks |
| `fig_ten_tasks.png` | Ten tasks with ~50 hours of hands-on work (Figure 1, one-column version) |
| `fig_calendar_tasks.csv` | The two tasks drawn as calendars (Figure 1, two-column version) |
| `fig_waiting_by_ai_fifth.png` | Typical waiting by how well AI does the task (Figure 2, two-column version) |
| `fig_work_vs_waiting.png` | Share of all hands-on work and all waiting by AI fifth ("a third of the work, half of the waiting") |
| `fig_verbs.png` | Typical waiting by a task's first verb (Figure 3, two-column version) |

## Data and definitions

- **SciNet v1.10.0**, commit `69973ad2cf21a34298b1f7f600f2c3820989113e` (29 Oct 2026).
- **Sample**: the 6,666 subfield tasks that go into papers (`task_type == "paper"` in `task_hours_per_year.csv`) with an AI rating, across 318 subfields.
- **How well AI does a task**: `elo_opus5` in `task_dimensions.csv`, SciNet's ranking of how likely Claude Opus 5 is to complete the task, built from pairwise comparisons by a language model. Tasks are split into five equal groups (fifths).
- **Hands-on time**: `researcher_hours` in `task_time.csv`.
- **Waiting**: `elapsed_hours - researcher_hours`, i.e. calendar time from start to finish minus hands-on time (SciNet runs a task's steps back to back).
- **Shares of all work and waiting** ("a third of the hands-on work but half of the waiting"): each task is weighted by how many times a researcher does it per year (`hours_per_year / hours_per_instance`) and by the number of researchers in its subfield worldwide (`researchers.csv`).
- **Robustness**: log waiting hours on the standardised AI rating with subfield fixed effects and log hands-on hours, standard errors clustered by subfield (−60% per SD, 95% CI −64 to −56); adding physical deployment and people-facing work (−37%). The ratio of calendar time to hands-on time falls with the AI rating in all six domains.

All times and ratings are SciNet's model-based estimates; the relationships are associations across tasks, not effects of using AI.

## Numbers that do not come from SciNet

- Scientists' self-reported speedup (1.9×) and expectations about discovery: OpenAI, [*Science at the Frontier*](https://openai.com/index/science-at-the-frontier/) (Nov 2026).
- UK project approvals: ONS Secure Research Service management information, Oct 2025–Sep 2026, median 50 working days including researcher time ([source](https://www.ons.gov.uk/aboutus/whatwedo/statistics/requestingstatistics/secureresearchservice/applyforanaccreditedresearchproject)).
