"""Exports the compact per-task data the scrollytelling site animates (docs/data.json).
Source: SciNet (Alamos & Althoff 2026, CC BY 4.0), paper tasks with an AI rating, built by scratch/figdata.py."""
import json, numpy as np, pandas as pd
ROOT = "/Users/alejandrotreny/Proyectos/Standford"
s = pd.read_csv(f"{ROOT}/scratch/paper_tasks.csv")
s["ai"] = s.elo_opus5.rank(pct=True)                      # 0 = AI rated worst, 1 = best
s["dec"] = pd.qcut(s.elo_opus5, 10, labels=False)
s["q"] = pd.qcut(s.elo_opus5, 5, labels=False)
s["ratio"] = s.days / (s.researcher_hours / 24)            # calendar days per day of work
doms = ["Formal Sciences", "Physical Sciences", "Life Sciences", "Health Sciences", "Social Sciences", "Arts & Humanities"]
s["dom"] = s.domain.map({d: i for i, d in enumerate(doms)})
s = s.sample(frac=1, random_state=7)                       # shuffle so index order carries no meaning
band = (s.researcher_hours >= 42) & (s.researcher_hours <= 56)
out = {
    "domains": doms,
    # columns: hours of work, calendar days, AI percentile, decile, quintile, domain, in the one-week band
    "t": [[round(h, 2), round(d, 3), round(a, 4), int(de), int(q), int(dm), int(b)]
          for h, d, a, de, q, dm, b in zip(s.researcher_hours, s.days, s.ai, s.dec, s.q, s.dom, band)],
    "deciles": s.groupby("dec").ratio.median().round(2).tolist(),
    "band": s[band].groupby("q").days.median().round(2).tolist(),
}
json.dump(out, open(f"{ROOT}/docs/data.json", "w"), separators=(",", ":"))
print(len(out["t"]), out["deciles"], out["band"])
