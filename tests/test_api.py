"""
API tests for report privacy, match authorization and re-matching.
Requires httpx (used by FastAPI's TestClient); skipped if it isn't installed.
"""
import unittest

from _env import ROOT  # noqa: F401  (sets up sys.path / test DB)

try:
    from fastapi.testclient import TestClient
except Exception:  # httpx missing
    TestClient = None


@unittest.skipIf(TestClient is None, "httpx not installed")
class TestApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from backend.app.main import app
        cls.client = TestClient(app)
        cls.alice = cls._register("alice@example.com")
        cls.bob = cls._register("bob@example.com")
        cls.eve = cls._register("eve@example.com")

    @classmethod
    def _register(cls, email):
        res = cls.client.post("/api/auth/register", json={
            "email": email, "full_name": email.split("@")[0], "password": "password123",
        })
        assert res.status_code == 201, res.text
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    def _report(self, headers, **fields):
        data = {"contact_name": "Tester", "contact_phone": "123", **fields}
        res = self.client.post("/api/reports/", data=data, headers=headers)
        self.assertEqual(res.status_code, 201, res.text)
        return res.json()["id"]

    def _matches(self, headers):
        return self.client.get("/api/matches/", headers=headers).json()["items"]

    def test_matching_flow_and_authorization(self):
        missing = self._report(
            self.alice, report_type="missing", gender="male",
            approximate_age_min="28", approximate_age_max="32", hair_color="black",
            clothing_description="blue jeans and a black jacket",
        )
        found = self._report(
            self.bob, report_type="found", gender="male",
            approximate_age_min="29", approximate_age_max="31", hair_color="Black",
            clothing_description="black jacket, jeans",
        )
        # An unrelated report must not be suggested
        self._report(self.bob, report_type="found", gender="female",
                     approximate_age_min="70", approximate_age_max="75")

        matches = [m for m in self._matches(self.alice) if m["missing_report_id"] == missing]
        self.assertEqual([m["found_report_id"] for m in matches], [found])
        match_id = matches[0]["id"]

        # A user unrelated to either report can't view or confirm the match
        self.assertEqual(self.client.get(f"/api/matches/{match_id}", headers=self.eve).status_code, 403)
        res = self.client.patch(f"/api/matches/{match_id}", json={"status": "confirmed"}, headers=self.eve)
        self.assertEqual(res.status_code, 403)
        self.assertEqual(self.client.get(f"/api/matches/{match_id}", headers=self.bob).status_code, 200)

        # Editing the found report so it contradicts the missing one removes the suggestion
        res = self.client.patch(f"/api/reports/{found}", json={"gender": "female"}, headers=self.bob)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertNotIn(match_id, [m["id"] for m in self._matches(self.alice)])

        # ...and editing it back brings a fresh suggestion
        self.client.patch(f"/api/reports/{found}", json={"gender": "male"}, headers=self.bob)
        self.assertIn(found, [m["found_report_id"] for m in self._matches(self.alice)])

    def test_reports_are_public_by_default(self):
        rid = self._report(self.alice, report_type="found")
        self.assertEqual(self.client.get(f"/api/reports/{rid}").status_code, 200)
        listed = self.client.get("/api/reports/?page_size=100").json()["items"]
        self.assertIn(rid, [r["id"] for r in listed])

    def test_private_report_hidden_from_others(self):
        rid = self._report(self.alice, report_type="missing", is_public="false")
        self.assertEqual(self.client.get(f"/api/reports/{rid}").status_code, 404)
        self.assertEqual(self.client.get(f"/api/reports/{rid}", headers=self.eve).status_code, 404)
        self.assertEqual(self.client.get(f"/api/reports/{rid}", headers=self.alice).status_code, 200)

    def test_contact_details_require_sign_in(self):
        rid = self._report(self.alice, report_type="missing", contact_email="a@example.com")
        anon = self.client.get(f"/api/reports/{rid}").json()
        self.assertIsNone(anon["contact_phone"])
        self.assertIsNone(anon["contact_email"])
        signed_in = self.client.get(f"/api/reports/{rid}", headers=self.eve).json()
        self.assertEqual(signed_in["contact_phone"], "123")


if __name__ == "__main__":
    unittest.main()
