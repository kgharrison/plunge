# Agent Instructions

## mitmproxy Setup & Cleanup

### Disable Proxy When Done

```bash
# Turn off HTTP/HTTPS proxy
networksetup -setwebproxystate "Wi-Fi" off
networksetup -setsecurewebproxystate "Wi-Fi" off
```

### Remove mitmproxy Certificate

```bash
# Remove the trusted certificate from System keychain
sudo security delete-certificate -c mitmproxy -t /Library/Keychains/System.keychain
```

### Re-enable Proxy for Traffic Capture

```bash
# Start mitmweb (web UI)
mitmweb

# Or start mitmproxy (terminal UI)
mitmproxy

# Enable proxy (port 8080 is default)
networksetup -setwebproxy "Wi-Fi" 127.0.0.1 8080
networksetup -setsecurewebproxy "Wi-Fi" 127.0.0.1 8080
```

### Install Certificate (if needed again)

```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/.mitmproxy/mitmproxy-ca-cert.pem
```

## Security Notes

- The mitmproxy CA certificate allows interception of ALL HTTPS traffic while trusted
- Only keep it installed while actively debugging
- The private key is stored at `~/.mitmproxy/`
- Remove the certificate when not in use
