# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Plunge, please report it responsibly:

1. **Do not** open a public issue
2. Email the maintainer directly or use GitHub's private vulnerability reporting feature
3. Include details about the vulnerability and steps to reproduce

## Security Considerations

### Credentials

- Pool system credentials are stored in browser localStorage (client-side only)
- Credentials are sent via HTTP headers to the API, never logged
- The `.env.local` file containing credentials is gitignored
- Never commit credentials to the repository

### Network Security

- Local connections communicate directly with your pool controller on your home network
- Remote connections go through Pentair's cloud service
- All Pentair cloud communication uses their standard authentication

### Self-Hosting

When self-hosting Plunge:

- Use HTTPS in production
- Keep dependencies updated
- Don't expose your instance to the public internet unless necessary
- Consider using authentication if hosting publicly

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |

## Dependencies

This project depends on third-party packages. We recommend:

- Regularly running `npm audit` to check for vulnerabilities
- Keeping dependencies updated
