"""
Replication code for "The Waiting Is the Hardest Part: AI and the Slow Side of Science"
(Alejandro Treny Ortega, November 2026).

Reproduces every number and figure in the note from the public SciNet release.

    python replicate.py                      # downloads SciNet (pinned commit) into ./scinet if missing
    python replicate.py --scinet /path/to/scinet

Outputs go to ./output: numbers.json, a printed summary, and the figures.
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf

SCINET_REPO = "https://github.com/lukasalthoff/scinet.git"
SCINET_COMMIT = "69973ad2cf21a34298b1f7f600f2c3820989113e"  # v1.10.0, 29 Oct 2026
KEY = ["task", "field", "subfield"]
HERE = os.path.dirname(os.path.abspath(__file__))


# ---------------------------------------------------------------- data
DATA_DIR = None


def get_scinet(path):
    if not os.path.isdir(os.path.join(path, "data")):
        print(f"Cloning SciNet into {path} ...")
        subprocess.run(["git", "clone", "-q", SCINET_REPO, path], check=True)
        subprocess.run(["git", "-C", path, "checkout", "-q", SCINET_COMMIT], check=True)
    return os.path.join(path, "data")


def build_sample(D):
    """One row per subfield task that goes into papers, with the AI rating and both clocks."""
    tasks = pd.read_csv(f"{D}/tasks.csv")
    dims = pd.read_csv(f"{D}/task_dimensions.csv")          # same rows and order as tasks.csv
    dims["category"] = tasks["category"]
    time = pd.read_csv(f"{D}/task_time.csv")
    hours = pd.read_csv(f"{D}/task_hours_per_year.csv")

    s = dims[dims.level == "subfield"].merge(
        time[time.level == "subfield"][KEY + ["researcher_hours", "elapsed_hours"]], on=KEY)
    s = s.merge(hours[hours.level == "subfield"][KEY + ["task_type"]], on=KEY)
    s = s[(s.task_type == "paper")].dropna(subset=["elo_opus5"]).copy()

    s["wait_hours"] = s.elapsed_hours - s.researcher_hours       # waiting = calendar time minus hands-on time
    s["wait_days"] = s.wait_hours / 24
    s["days"] = s.elapsed_hours / 24
    # five equal groups by the AI rating: q = 4 is the fifth AI does best, q = 0 the fifth it does worst
    s["q"] = pd.qcut(s.elo_opus5, 5, labels=False)
    s["verb"] = s.task.str.split().str[0].str.lower()
    s["sf"] = s.field + "|" + s.subfield
    return s


def world_shares(D, s):
    """Share of all hands-on work and of all waiting in a year of research, by AI fifth.
    Each task is weighted by how often a researcher does it per year (SciNet's hours-per-year model)
    and by the number of researchers in its subfield worldwide."""
    h = pd.read_csv(f"{D}/task_hours_per_year.csv")
    h = h[(h.level == "subfield") & (h.task_type == "paper")]
    x = h.merge(s[KEY + ["q", "researcher_hours", "elapsed_hours"]], on=KEY)
    x["instances_per_year"] = x.hours_per_year / x.hours_per_instance.replace(0, np.nan)
    x["wait_per_year"] = x.instances_per_year * (x.elapsed_hours - x.researcher_hours)
    rs = pd.read_csv(f"{D}/researchers.csv", keep_default_na=False)
    w = rs[(rs.country == "World") & (rs.level == "subfield")][["field", "subfield", "researchers"]].copy()
    w["researchers"] = w.researchers.astype(float)
    x = x.merge(w, on=["field", "subfield"])
    work = (x.hours_per_year * x.researchers).groupby(x.q).sum()
    wait = (x.wait_per_year * x.researchers).groupby(x.q).sum()
    return (work / work.sum()), (wait / wait.sum())


# ---------------------------------------------------------------- numbers
EXAMPLES = [  # Figure 1 of the one-column version: ~50 hands-on hours each, near their group's median calendar time
    "Fit statistical downscaling models to relate large-scale climate patterns to local weather variables.",
    "Implement event study methodology to measure abnormal returns around corporate announcements or policy changes.",
    "Process raw GPS trajectories to extract trip segments, travel times, and route choices.",
    "Solve nonlinear algebraic or differential systems arising from discretization by iterative linearization.",
    "Construct genetic or physical marker maps to localize loci and anchor genome assemblies.",
    "Obtain tissue samples from marine organisms for genetic, histological, or biochemical analyses.",
    "Grow single crystals using flux, Bridgman, or floating zone techniques for bulk property measurements.",
    "Collect ocular tissue samples, aqueous humor, or tear fluid for laboratory analysis.",
    "Acquire archival materials from ecclesiastical repositories, diocesan archives, or religious order collections.",
    "Gather conversational or discourse data through recordings of natural language interactions.",
]
CALENDAR = EXAMPLES[0], EXAMPLES[6]   # Figure 1 of the two-column version
VERBS = ["fit", "calculate", "process", "analyze", "collect", "conduct", "obtain", "recruit", "coordinate", "negotiate"]


def regressions(s):
    """Log waiting hours on the standardised AI rating, subfield fixed effects, log hands-on hours.
    Standard errors clustered by subfield. Reported as % change in waiting per standard deviation."""
    x = s.copy()
    x["z"] = (x.elo_opus5 - x.elo_opus5.mean()) / x.elo_opus5.std()
    x["lw"] = np.log(x.wait_hours + 1)
    x["lh"] = np.log(x.researcher_hours)
    out = {}
    for name, f in [("subfield_fe_hours", "lw ~ z + lh + C(sf)"),
                    ("plus_physical_people", "lw ~ z + lh + physical_deployment + medium_people + C(sf)")]:
        r = smf.ols(f, x).fit(cov_type="cluster", cov_kwds={"groups": pd.factorize(x.sf)[0]})
        lo, hi = r.conf_int().loc["z"]
        out[name] = {"pct_change_per_sd": float(round(100 * (np.exp(r.params["z"]) - 1), 1)),
                     "ci95": [float(round(100 * (np.exp(lo) - 1), 1)), float(round(100 * (np.exp(hi) - 1), 1))]}
    by_domain = {}
    for dom, g in x.groupby("domain"):
        r = smf.ols("np.log(elapsed_hours / researcher_hours) ~ z + lh + C(sf)", g).fit(
            cov_type="cluster", cov_kwds={"groups": pd.factorize(g.sf)[0]})
        by_domain[dom] = {"coef_z": round(r.params["z"], 3), "t": round(r.tvalues["z"], 1)}
    out["calendar_to_work_ratio_by_domain"] = by_domain
    out["no_waiting_words_in_steps"] = waiting_words_check(x)
    return out


WAIT_WORDS = (r"\b(?:wait|waiting|await|incubat|grow|growth|cultur|approv|permit|ethic|IRB|consent|recruit|schedul|deliver|ship|queue|"
              r"negotiat|request|apply for|application|review board|fieldwork|season|follow-up|longitudinal|cure|dry|settle|ferment)")


def waiting_words_check(x):
    """Circularity check. The AI judge never saw calendar time, but it did read each task's steps, and some steps
    describe waiting (approvals, recruitment, incubation...). Drop every task with any such word in its steps and
    re-estimate: if the link survived only through those steps, it would vanish here."""
    ss = pd.read_csv(f"{DATA_DIR}/substeps.csv.gz")
    ss = ss[ss.level == "subfield"]
    ss["flag"] = ss.substep.str.contains(WAIT_WORDS, case=False, regex=True)
    f = ss.groupby(KEY).flag.any().reset_index()
    y = x.merge(f, on=KEY, how="left")
    y["flag"] = y.flag.fillna(False).astype(bool)
    keep = y[~y.flag].copy()
    r = smf.ols("lw ~ z + lh + C(sf)", keep).fit(cov_type="cluster", cov_kwds={"groups": pd.factorize(keep.sf)[0]})
    lo, hi = r.conf_int().loc["z"]
    q = keep.groupby("q").wait_hours.median()
    return {"share_of_tasks_flagged": float(round(y.flag.mean(), 3)), "n_kept": int(len(keep)),
            "pct_change_per_sd": float(round(100 * (np.exp(r.params["z"]) - 1), 1)),
            "ci95": [float(round(100 * (np.exp(lo) - 1), 1)), float(round(100 * (np.exp(hi) - 1), 1))],
            "median_wait_best_fifth_hours": float(round(q.get(4), 1)), "median_wait_worst_fifth_days": float(round(q.get(0) / 24, 1))}


def compute(D):
    s = build_sample(D)
    N = {"paper_tasks": int(len(s)), "subfields": int(s.sf.nunique())}
    by_q = s.groupby("q").agg(median_wait_hours=("wait_hours", "median"), median_hands_on_hours=("researcher_hours", "median"),
                              n=("task", "size"))
    band = s[(s.researcher_hours >= 42) & (s.researcher_hours <= 56)]
    by_q_band = band.groupby("q").agg(median_wait_days=("wait_days", "median"), median_days=("days", "median"), n=("task", "size"))
    verbs = s.groupby("verb").wait_days.median().reindex(VERBS)
    dom = s[s.q.isin([0, 4])].groupby(["domain", "q"]).wait_days.median().unstack()
    work_share, wait_share = world_shares(D, s)
    ex = s.set_index("task").loc[EXAMPLES, ["subfield", "researcher_hours", "wait_days", "days", "elo_opus5", "q"]]
    res = {
        "sample": N,
        "median_wait_by_AI_fifth_hours (4=best, 0=worst)": by_q.median_wait_hours.round(1).to_dict(),
        "median_hands_on_by_AI_fifth_hours": by_q.median_hands_on_hours.round(0).to_dict(),
        "tasks_with_42_56_hands_on_hours": {"median_wait_days": by_q_band.median_wait_days.round(2).to_dict(),
                                            "median_days_start_to_finish": by_q_band.median_days.round(2).to_dict(),
                                            "n": by_q_band.n.to_dict()},
        "share_of_world_hands_on_work_by_fifth": work_share.round(3).to_dict(),
        "share_of_world_waiting_by_fifth": wait_share.round(3).to_dict(),
        "median_wait_days_by_first_verb": verbs.round(2).to_dict(),
        "median_wait_days_worst_vs_best_fifth_by_domain": {d: {"worst_days": round(r[0], 2), "best_hours": round(r[4] * 24, 1)}
                                                           for d, r in dom.iterrows()},
        "examples": {t: {k: (round(v, 2) if isinstance(v, float) else v) for k, v in r.items()} for t, r in ex.iterrows()},
        "regressions": regressions(s),
    }
    return s, res


# ---------------------------------------------------------------- figures
def figures(s, res, D, out):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib import font_manager as fm
    from matplotlib.patches import Rectangle
    for f in ["/System/Library/Fonts/Supplemental/Iowan Old Style.ttc"]:
        if os.path.exists(f):
            fm.fontManager.addfont(f); plt.rcParams["font.family"] = "Iowan Old Style"
    INK, AMB, TINT, SL, RULE = "#2C5194", "#B97C15", "#F1D9AE", "#5F646C", "#D9DCE1"
    plt.rcParams.update({"font.size": 8.5, "hatch.linewidth": 0.6, "axes.linewidth": 0.6, "axes.edgecolor": SL,
                         "xtick.color": SL, "ytick.color": SL})

    def clean(ax, keep=("bottom",)):
        for k in ["left", "right", "top", "bottom"]:
            ax.spines[k].set_visible(k in keep)

    # Ten tasks (one-column version, Figure 1)
    ex = s.set_index("task").loc[EXAMPLES]
    fig, ax = plt.subplots(figsize=(6.7, 2.9))
    for i, (t, r) in enumerate(ex.iterrows()):
        y = 9 - i + (1.2 if i < 5 else 0)
        ax.add_patch(Rectangle((0, y - .28), r.researcher_hours / 24, .56, color=INK))
        ax.add_patch(Rectangle((r.researcher_hours / 24, y - .28), r.wait_days, .56, facecolor=TINT, edgecolor=AMB, hatch="////", lw=0))
        ax.text(r.days + .6, y, f"{r.days:.1f} days", va="center", fontsize=8)
        ax.text(-.6, y, t[:60] + ("…" if len(t) > 60 else ""), ha="right", va="center", fontsize=7)
    ax.set_xlim(0, 56); ax.set_ylim(-.8, 11.5); ax.set_yticks([]); clean(ax); ax.set_xlabel("Days from start to finish")
    plt.subplots_adjust(left=0.5, right=0.97, bottom=0.17, top=0.97); fig.savefig(f"{out}/fig_ten_tasks.png", dpi=200); plt.close(fig)

    # Calendar data (two-column version, Figure 1; drawn in HTML in the paper)
    cal = s.set_index("task").loc[list(CALENDAR), ["subfield", "researcher_hours", "wait_days", "days"]]
    cal.to_csv(f"{out}/fig_calendar_tasks.csv")

    # Typical waiting by AI fifth (two-column version, Figure 2)
    m = pd.Series(res["median_wait_by_AI_fifth_hours (4=best, 0=worst)"]).reindex([4, 3, 2, 1, 0]) / 24
    fig, ax = plt.subplots(figsize=(3.3, 1.6)); x = np.arange(5)
    ax.bar(x, m.values, facecolor=TINT, edgecolor=AMB, hatch="////", lw=0, width=.6)
    for xi, v in zip(x, m.values):
        ax.text(xi, v + .9, f"{v*24:.0f} hours" if v < 1 else (f"{v:.1f} days" if v < 2 else f"{v:.0f} days"), ha="center", fontsize=7.8)
    ax.set_xticks(x); ax.set_xticklabels(["AI does\nbest", "", "", "", "AI does\nworst"]); ax.set_yticks([]); clean(ax)
    plt.tight_layout(pad=.3); fig.savefig(f"{out}/fig_waiting_by_ai_fifth.png", dpi=200); plt.close(fig)

    # Share of all hands-on work vs all waiting by AI fifth (quoted in the text: a third of the work, half of the waiting)
    work = pd.Series(res["share_of_world_hands_on_work_by_fifth"]).reindex([4, 3, 2, 1, 0])
    wait = pd.Series(res["share_of_world_waiting_by_fifth"]).reindex([4, 3, 2, 1, 0])
    fig, ax = plt.subplots(figsize=(3.3, 1.8)); x = np.arange(5); bw = .36
    ax.bar(x - bw / 2, work * 100, width=bw, color=INK, label="share of all hands-on work")
    ax.bar(x + bw / 2, wait * 100, width=bw, facecolor=TINT, edgecolor=AMB, hatch="////", lw=0, label="share of all waiting")
    for i in (0, 4):
        ax.text(x[i] - bw / 2, work.iloc[i] * 100 + 1.4, f"{work.iloc[i]*100:.0f}%", ha="center", fontsize=7.4)
        ax.text(x[i] + bw / 2, wait.iloc[i] * 100 + 1.4, f"{wait.iloc[i]*100:.0f}%", ha="center", fontsize=7.4, weight="bold")
    ax.set_xticks(x); ax.set_xticklabels(["AI does\nbest", "", "", "", "AI does\nworst"]); ax.set_yticks([]); clean(ax)
    ax.legend(frameon=False, fontsize=7, loc="upper left"); plt.tight_layout(pad=.3); fig.savefig(f"{out}/fig_work_vs_waiting.png", dpi=200); plt.close(fig)

    # Waiting by first verb (two-column version, Figure 3)
    v = pd.Series(res["median_wait_days_by_first_verb"])
    fig, ax = plt.subplots(figsize=(3.3, 2.3)); y = np.arange(len(v))[::-1]
    ax.barh(y, v.values, facecolor=TINT, edgecolor=AMB, hatch="////", lw=0, height=.6)
    for yi, (k, d) in zip(y, v.items()):
        ax.text(d + 1.4, yi, f"{d*24:.0f} hours" if d < 1 else f"{d:.0f} days", va="center", fontsize=7.5)
    ax.set_yticks(y); ax.set_yticklabels([k.capitalize() for k in v.index], style="italic"); ax.set_xlim(0, 95)
    ax.set_xlabel("Typical waiting (days)"); ax.tick_params(axis="y", length=0); clean(ax)
    plt.tight_layout(pad=.3); fig.savefig(f"{out}/fig_verbs.png", dpi=200); plt.close(fig)


# ---------------------------------------------------------------- main
def summary(res):
    q = res["median_wait_by_AI_fifth_hours (4=best, 0=worst)"]
    b = res["tasks_with_42_56_hands_on_hours"]["median_wait_days"]
    ws, wk = res["share_of_world_waiting_by_fifth"], res["share_of_world_hands_on_work_by_fifth"]
    r = res["regressions"]
    lines = [
        f"Sample: {res['sample']['paper_tasks']:,} paper tasks in {res['sample']['subfields']} subfields",
        f"Median waiting, fifth AI does best: {q[4]:.1f} hours; fifth AI does worst: {q[0]/24:.1f} days",
        f"Tasks with 42-56 hands-on hours, median waiting best->worst (days): " + ", ".join(f"{b[k]:.2f}" for k in [4, 3, 2, 1, 0]),
        f"Worst fifth: {wk[0]:.0%} of all hands-on work, {ws[0]:.0%} of all waiting; best fifth: {wk[4]:.0%} / {ws[4]:.0%}",
        f"Within subfields at equal hands-on hours: {r['subfield_fe_hours']['pct_change_per_sd']}% waiting per SD of AI rating "
        f"(95% CI {r['subfield_fe_hours']['ci95']}); adding physical and people-facing work: {r['plus_physical_people']['pct_change_per_sd']}%",
        f"Without tasks whose steps mention waiting ({r['no_waiting_words_in_steps']['share_of_tasks_flagged']:.0%} dropped): "
        f"{r['no_waiting_words_in_steps']['pct_change_per_sd']}% per SD (95% CI {r['no_waiting_words_in_steps']['ci95']}); "
        f"median wait {r['no_waiting_words_in_steps']['median_wait_best_fifth_hours']} h vs {r['no_waiting_words_in_steps']['median_wait_worst_fifth_days']} days",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--scinet", default=os.path.join(HERE, "scinet"), help="path to a SciNet checkout")
    ap.add_argument("--out", default=os.path.join(HERE, "output"))
    a = ap.parse_args()
    D = get_scinet(a.scinet)
    DATA_DIR = D
    os.makedirs(a.out, exist_ok=True)
    s, res = compute(D)
    with open(os.path.join(a.out, "numbers.json"), "w") as f:
        json.dump(res, f, indent=1, default=str)
    figures(s, res, D, a.out)
    print(summary(res))
    print(f"\nWrote {a.out}/numbers.json and figures.")
