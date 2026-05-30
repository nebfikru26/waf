import urllib.request
import json

token = open('/Users/user/Documents/MaMUSHi/Projects/waf/backend/wwwroot/logs/dev_token.txt').read().strip() if open('/Users/user/Documents/MaMUSHi/Projects/waf/backend/wwwroot/logs/dev_token.txt', 'r') else ''
# Wait, I don't have the token. I'll just write a C# script inside the container to test it.
