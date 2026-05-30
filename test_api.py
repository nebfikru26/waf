import requests

# 1. Login
login_url = "http://localhost:5001/api/users/login"
try:
    resp = requests.post(login_url, json={"email": "admin@affinisecurity.com", "password": "AdminPassword123!"})
    token = resp.json().get("token")
    if not token:
        print("Failed to get token:", resp.text)
        exit(1)
    
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # 2. GET Settings
    settings_url = "http://localhost:5001/api/modules/security-settings"
    s_resp = requests.get(settings_url, headers=headers)
    settings = s_resp.json()
    print("GET settings:", settings)
    
    # 3. PUT Settings
    put_data = settings.copy()
    put_data["jsChallengeEnabled"] = False
    put_data["js_challenge_enabled"] = False
    
    p_resp = requests.put(settings_url, headers=headers, json=put_data)
    print("PUT status:", p_resp.status_code)
    print("PUT response:", p_resp.text)
    
except Exception as e:
    print("Error:", e)
