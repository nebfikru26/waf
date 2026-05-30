echo "Starting log shipper..."
tail -n 1 /var/log/coraza/audit.log | while read line; do
  echo "$line" | nats pub waf.logs.audit -s nats://nats:4222
done
