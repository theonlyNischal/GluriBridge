# SRN-PPI Indonesia Mitigation Project Crawler

Crawls the public SRN-PPI Indonesia registry (api.srnmenlh.id) for all
mitigation projects (action=Mitigasi, all sectors).

## What's included

- `srn_ppi_crawler.py` — the crawler script. Fetches the full project list,
  then every individual project's detail record, storing complete raw
  JSON for both (no fields flattened, renamed, or dropped).
- `data/project_list/all_projects.json` — the confirmed-complete list of
  191 projects, already fetched and verified (unique idx values, matches
  `recordsTotal`). Requesting `pageSize=200` returns all 191 in a single
  page (`page_total: 1`).

## Usage

```bash
pip install requests tqdm
python srn_ppi_crawler.py
```

This re-fetches the list (or reuses the one included here) and downloads
every individual project detail record to `data/raw_details/`, with a
1-2s politeness delay, retry/backoff, and a `data/metadata/` quality
report + failed-projects log. See the script's own docstring for full
details on output layout and configuration (env var overrides for page
size, worker count, timeout, retries).
