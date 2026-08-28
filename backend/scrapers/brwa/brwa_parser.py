"""
brwa_parser.py
==============
Shared parsing logic for BRWA (brwa.id) "Wilayah Adat" profile pages.

Given the raw HTML of https://brwa.id/profil/{idx}, extracts:
  - idx, title
  - Administratif table (Propinsi/Kabupaten/Kecamatan/Desa)
  - Kewilayahan table (Luas/Satuan/Kondisi Fisik)
  - All narrative sections (Profil Wilayah Adat, Batas Wilayah Adat, Sejarah,
    Kelembagaan Adat, Tata Ruang Hidup di Wilayah Adat,
    Pranata Penguasaan dan Kelola-Lindung di Wilayah Adat,
    Pranata Sosial Budaya, Potensi dan Keanekaragaman Hayati, Kebijakan)
  - Kebijakan table (policy/regulation names + PDF links)
  - All PDF links anywhere on the page
  - The embedded waGeoJSON polygon (as real GeoJSON)
  - Any gallery images (non-UI/non-map-tile <img> srcs)

This module has no network calls -- it is pure HTML/text parsing, so it can
be reused both by the demo below (parsing the user-uploaded sample) and by
the full crawler (brwa_crawler.py) that fetches pages live.
"""

from __future__ import annotations

import json
import re
from typing import Any, Optional

from bs4 import BeautifulSoup

NARRATIVE_SECTIONS = [
    "Profil Wilayah Adat",
    "Batas Wilayah Adat",
    "Sejarah",
    "Kelembagaan Adat",
    "Tata Ruang Hidup di Wilayah Adat",
    "Pranata Penguasaan dan Kelola-Lindung di Wilayah Adat",
    "Pranata Sosial Budaya",
    "Potensi dan Keanekaragaman Hayati",
    "Kebijakan",
]

WAGEOJSON_RE = re.compile(r"waGeoJSON\s*=\s*(\{.*?\});", re.DOTALL)


def _clean(text: Optional[str]) -> Optional[str]:
    if text is None:
        return None
    text = text.strip()
    return text if text else None


def _table_to_dict(table) -> dict:
    """Turns a 2-column key/value table (like Administratif, Kewilayahan)
    into a plain dict. Skips header-only rows (single <th>/<td>)."""
    out = {}
    for tr in table.find_all("tr"):
        cells = tr.find_all(["td", "th"])
        if len(cells) == 2:
            key = cells[0].get_text(" ", strip=True)
            val = cells[1].get_text(" ", strip=True)
            if key:
                out[key] = val
    return out


def _section_text(h5) -> str:
    """Collects all text between an <h5> section header (wrapped in its own
    div) and the next section header div, preserving paragraph breaks."""
    wrapper = h5.parent
    out = []
    sib = wrapper.find_next_sibling()
    while sib:
        if getattr(sib, "name", None) == "div" and sib.find("h5"):
            break
        txt = sib.get_text("\n", strip=True)
        if txt:
            out.append(txt)
        sib = sib.find_next_sibling()
    return "\n".join(out)


def extract_geojson(html: str) -> Optional[dict]:
    m = WAGEOJSON_RE.search(html)
    if not m:
        return None
    return json.loads(m.group(1))


def extract_pdf_links(soup: BeautifulSoup, base_url: str = "https://brwa.id") -> list[str]:
    pdfs = []
    seen = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if ".pdf" in href.lower():
            if href.startswith("http"):
                url = href
            elif href.startswith("/"):
                url = base_url.rstrip("/") + href
            else:
                url = base_url.rstrip("/") + "/" + href
            if url not in seen:
                seen.add(url)
                pdfs.append(url)
    return pdfs


def extract_gallery_images(soup: BeautifulSoup, base_url: str = "https://brwa.id") -> list[str]:
    """Best-effort: grabs <img> srcs that look like uploaded photos rather
    than UI chrome (logos, base64 placeholders, leaflet map tiles)."""
    imgs = []
    seen = set()
    for img in soup.find_all("img"):
        src = img.get("src") or ""
        if not src or src.startswith("data:"):
            continue
        low = src.lower()
        if "logo" in low or "leaflet" in low or "/tile" in low:
            continue
        if src.startswith("http"):
            url = src
        elif src.startswith("/"):
            url = base_url.rstrip("/") + src
        else:
            continue
        if url not in seen:
            seen.add(url)
            imgs.append(url)
    return imgs


def parse_profile_html(html: str, idx: str, base_url: str = "https://brwa.id") -> dict[str, Any]:
    soup = BeautifulSoup(html, "lxml")

    title_tag = soup.find("h2")
    title = _clean(title_tag.get_text(" ", strip=True)) if title_tag else None

    tables = soup.find_all("table")
    administratif = {}
    kewilayahan = {}
    kebijakan_table = []

    for t in tables:
        header_text = t.get_text(" ", strip=True)
        d = _table_to_dict(t)
        if "Propinsi" in d or header_text.startswith("Administratif"):
            administratif = d
        elif "Luas" in d or header_text.startswith("Kewilayahan"):
            kewilayahan = d
        else:
            # Likely the Kebijakan / regulations table: row -> (no, description)
            for tr in t.find_all("tr"):
                cells = tr.find_all(["td", "th"])
                if len(cells) >= 2:
                    desc_cell = cells[1]
                    link = desc_cell.find("a", href=True)
                    kebijakan_table.append({
                        "no": cells[0].get_text(" ", strip=True),
                        "description": desc_cell.get_text(" ", strip=True),
                        "pdf_url": (link["href"] if link and ".pdf" in link["href"].lower() else None),
                    })

    sections = {}
    for h5 in soup.find_all("h5"):
        heading = _clean(h5.get_text(strip=True))
        if heading in NARRATIVE_SECTIONS:
            sections[heading] = _section_text(h5)

    geojson = extract_geojson(html)
    pdf_links = extract_pdf_links(soup, base_url)
    gallery_images = extract_gallery_images(soup, base_url)

    return {
        "idx": idx,
        "source_url": f"{base_url.rstrip('/')}/profil/{idx}",
        "title": title,
        "administratif": administratif,
        "kewilayahan": kewilayahan,
        "sections": sections,
        "kebijakan_table": kebijakan_table,
        "pdf_links": pdf_links,
        "gallery_images": gallery_images,
        "has_geojson": geojson is not None,
        "geometry_type": (
            geojson["features"][0]["geometry"]["type"]
            if geojson and geojson.get("features") else None
        ),
        "geojson_properties": (
            geojson["features"][0]["properties"]
            if geojson and geojson.get("features") else None
        ),
    }, geojson
