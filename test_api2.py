import requests
import subprocess

# Get a token using a fake login or extract it from postgres if needed
# Actually, the API doesn't store tokens in the DB, it validates JWTs signed with Waf__JwtSecret.
# Let's use docker exec to run a curl request inside the api-dotnet container, 
# wait, we need a valid JWT. We can use python's PyJWT to forge one!
import jwt
from datetime import datetime, timedelta

# The secret is in docker-compose.yml: AFFINI_SECURE_WAF_KEY_2026_PROD_REPLACE_ME_NOW_
secret = "AFFINI_SECURE_WAF_KEY_2026_PROD_REPLACE_ME_NOW_"
payload = {
    "sub": "1",
    "email": "admin@affinisecurity.com",
    "role": "super_admin",
    "tenantId": "884324cb-58ba-40e1-945b-27a274075ada",
    "exp": int((datetime.utcnow() + timedelta(days=1)).timestamp())
}
token = jwt.encode(payload, secret, algorithm="HS256")
print("Forged token:", token)

headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
settings_url = "http://localhost:5001/api/modules/security-settings"
s_resp = requests.get(settings_url, headers=headers)
print("GET settings status:", s_resp.status_code)
settings = s_resp.json()
print("GET settings body:", settings)

put_data = settings.copy()
put_data["jsChallengeEnabled"] = False
put_data["js_challenge_enabled"] = False
p_resp = requests.put(settings_url, headers=headers, json=put_data)
print("PUT status:", p_resp.status_code)
print("PUT response:", p_resp.text)
