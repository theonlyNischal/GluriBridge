import sys
sys.path.insert(0, "..")

from gluribridge.contact_resolution import find_org_website_contact, resolve_contact_tier_b
from gluribridge.schema import UnifiedCandidateRecord, RegistrantContact


class MockTavilyClient:
    """Returns canned responses keyed by a substring of the query, so tests
    don't need network access."""
    def __init__(self, responses_by_query_substring):
        self.responses = responses_by_query_substring

    def search(self, query, **kwargs):
        for substr, response in self.responses.items():
            if substr in query:
                return response
        return {"results": []}


print("=== Case 1: real org website found, email extractable ===")
mock_client = MockTavilyClient({
    "Yayasan Hutan Lestari Nusantara": {
        "results": [
            {"url": "https://www.mongabay.co.id/2026/08/yhln-mangrove", "title": "News about YHLN",
             "content": "Yayasan Hutan Lestari Nusantara announced a new project."},
            {"url": "https://hutanlestarinusantara.or.id/kontak", "title": "Kontak - Yayasan Hutan Lestari Nusantara",
             "content": "Hubungi kami di info@hutanlestarinusantara.or.id atau telepon (021) 555-0123."},
            {"url": "https://www.linkedin.com/company/yhln", "title": "YHLN on LinkedIn", "content": "..."},
        ]
    }
})
result = find_org_website_contact("Yayasan Hutan Lestari Nusantara", mock_client)
print(result)

print()
print("=== Case 2: only news/social hits, no real org site ===")
mock_client_2 = MockTavilyClient({
    "Some Org": {
        "results": [
            {"url": "https://news.example.id/some-org-story", "title": "News about Some Org", "content": "Some Org did a thing."},
            {"url": "https://www.facebook.com/someorg", "title": "Some Org on Facebook", "content": "..."},
        ]
    }
})
result2 = find_org_website_contact("Some Org", mock_client_2)
print(result2)

print()
print("=== Case 3: generic placeholder org — should short-circuit, no search call ===")
result3 = find_org_website_contact("Multiple Project Proponents", mock_client_2)
print(result3)

print()
print("=== Full resolve_contact_tier_b: skips a candidate that already has Tier A ===")
cand_tier_a = UnifiedCandidateRecord(
    name="Test", org="PT Rimba Makmur Utama",
    registrant_contact=RegistrantContact(name="Asep Ayat", org="PT Rimba Makmur Utama", contact_source="sruk_registrant"),
)
changed = resolve_contact_tier_b(cand_tier_a, mock_client)
print(f"changed={changed} (expect False — already has Tier A)")
print(f"contact_source still: {cand_tier_a.registrant_contact.contact_source}")

print()
print("=== Full resolve_contact_tier_b: DOES run for a candidate with no contact yet ===")
cand_no_contact = UnifiedCandidateRecord(
    name="Test2", org="Yayasan Hutan Lestari Nusantara",
    registrant_contact=RegistrantContact(),
)
changed2 = resolve_contact_tier_b(cand_no_contact, mock_client)
print(f"changed={changed2} (expect True)")
print(f"contact_source now: {cand_no_contact.registrant_contact.contact_source}")
print(f"merge history entry: {cand_no_contact.merged_from}")

print()
print("=== Case 4 (ADVERSARIAL): unlisted news domain, coincidental domain match, unrelated email present ===")
mock_client_adversarial = MockTavilyClient({
    "Hutan Rakyat Mandiri": {
        "results": [
            {
                "url": "https://hutanrakyatnews.id/artikel/hutan-rakyat-mandiri-terima-dana-hibah",
                "title": "Hutan Rakyat Mandiri Terima Dana Hibah dari Pemerintah",
                "content": (
                    "Hutan Rakyat Mandiri mengumumkan penerimaan dana hibah senilai Rp 2 miliar. "
                    "Menurut juru bicara kementerian, dana ini akan digunakan untuk restorasi lahan. "
                    "Kirim tips berita ke tips@hutanrakyatnews.id."
                ),
            },
        ]
    }
})
result4 = find_org_website_contact("Hutan Rakyat Mandiri", mock_client_adversarial)
print(result4)
print("Expect found=False -- content is third-party news narration, despite domain+email both present")

print()
print("=== Case 5 (true positive with new logic): org's own page, copyright footer matches ===")
mock_client_5 = MockTavilyClient({
    "Hutan Rakyat Mandiri": {
        "results": [
            {
                "url": "https://hutanrakyatmandiri.id/kontak",
                "title": "Kontak - Hutan Rakyat Mandiri",
                "content": (
                    "Tentang Kami: Hutan Rakyat Mandiri adalah koperasi petani hutan. "
                    "Hubungi kami di info@hutanrakyatmandiri.id. "
                    "\u00a9 2026 Hutan Rakyat Mandiri. Seluruh hak cipta dilindungi."
                ),
            },
        ]
    }
})
result5 = find_org_website_contact("Hutan Rakyat Mandiri", mock_client_5)
print(result5)
print("Expect found=True, confidence=high (copyright_footer signal)")

print()
print("=== Case 6 (real case, 2026-08-31): short-name-only self-ID via copyright footer ===")
print("(the exact real PILI-Green Network pattern: org's own page never spells out")
print(" the full formal 'Yayasan ...' name, only its short/common name)")
mock_client_6 = MockTavilyClient({
    "Yayasan Pusat Informasi Lingkungan Indonesia": {
        "results": [
            {
                "url": "https://pili.or.id/kontak",
                "title": "Kontak - PILI",
                "content": (
                    "Email: info@pili.or.id. "
                    "© 2026 PILI-Green Network. All rights reserved."
                ),
            },
        ]
    }
})
result6 = find_org_website_contact("Yayasan Pusat Informasi Lingkungan Indonesia (PILI-Green Network)", mock_client_6)
print(result6)
print("Expect found=True, confidence=high (copyright_footer signal, via the SHORT name)")

print()
print("=== Case 7 (ADVERSARIAL, guards the new short-name path): coincidental short-name")
print(" collision on an unrelated third-party narrative page, mirroring Case 4's exact pattern")
mock_client_7 = MockTavilyClient({
    "Yayasan Konservasi Alam Contoh": {
        "results": [
            {
                "url": "https://beritalingkungan.id/artikel/kas-terima-dana-hibah",
                "title": "KAS Terima Dana Hibah dari Pemerintah",
                "content": (
                    "KAS mengumumkan penerimaan dana hibah senilai Rp 2 miliar. "
                    "Menurut juru bicara kementerian, dana ini akan digunakan untuk restorasi lahan. "
                    "Kirim tips berita ke tips@beritalingkungan.id."
                ),
            },
        ]
    }
})
result7 = find_org_website_contact("Yayasan Konservasi Alam Contoh (KAS)", mock_client_7)
print(result7)
print("Expect found=False -- 'KAS' (3 chars) is below SHORT_SLUG_THRESHOLD, so only Signal 1")
print("(copyright footer) is trusted for it, same as any other short slug -- this narrative")
print("page has no copyright footer naming KAS, so it must still be rejected.")

print()
print("=== Case 8 (ADVERSARIAL): short name long enough for weaker signals, but page is still")
print(" genuinely third-party narrative (not org's own site) -- must still reject")
mock_client_8 = MockTavilyClient({
    "Yayasan Konservasi Hutan Nusantara": {
        "results": [
            {
                "url": "https://beritalingkungan.id/artikel/konservasi-hutan-nusantara-dana",
                "title": "Konservasi Hutan Nusantara Terima Dana Hibah dari Pemerintah",
                "content": (
                    "Konservasi Hutan Nusantara mengumumkan penerimaan dana hibah senilai Rp 2 miliar. "
                    "Menurut juru bicara kementerian, dana ini akan digunakan untuk restorasi lahan. "
                    "Kirim tips berita ke tips@beritalingkungan.id."
                ),
            },
        ]
    }
})
result8 = find_org_website_contact("Yayasan Konservasi Hutan Nusantara (Konservasi Hutan Nusantara)", mock_client_8)
print(result8)
print("Expect found=False -- long slug but third-party narrative, no label separator in title,")
print("no copyright footer -- same protections as Case 4, now exercised via the short-name path.")

print()
print("=== Case 9 (ADVERSARIAL, guards GENERIC_SHORT_NAME_SUFFIXES): '(PP)' role-marker")
print(" suffix must NEVER be extracted as a short name -- proves a real coincidental-substring")
print(" false positive this WOULD cause without the guard (real risk: 'pp' is a substring of")
print(" the ordinary English word 'Approved', which can appear in any unrelated copyright line)")
mock_client_9 = MockTavilyClient({
    "PT Hutan Amanah Lestari": {
        "results": [
            {
                "url": "https://approvedproducts.example.id/about",
                "title": "About Us - Approved Products Indonesia",
                "content": (
                    "Approved Products Indonesia adalah distributor produk pertanian. "
                    "© 2026 PT Approved Products Indonesia. All rights reserved."
                ),
            },
        ]
    }
})
result9 = find_org_website_contact("PT Hutan Amanah Lestari (PP)", mock_client_9)
print(result9)
print("Expect found=False -- '(PP)' must never be treated as a short name at all (it's a")
print("Verra-track role marker, 'Project Proponent', shared across dozens of unrelated real")
print("candidates), so this unrelated company's page must be rejected outright, not")
print("accidentally accepted because its copyright line happens to contain the substring 'pp'.")
