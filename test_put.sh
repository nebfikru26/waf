#!/bin/bash
curl -k -v -X PUT http://localhost:5001/api/modules/security-settings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mock_dev_token_12345" \
  -d '{"BotProtectionEnabled": true, "JsChallengeEnabled": true, "CaptchaEnabled": true}'
