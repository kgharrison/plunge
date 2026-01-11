# Contributing to Plunge

Thank you for your interest in contributing to Plunge! This document provides guidelines for contributing to the project.

## Getting Started

1. **Fork the repository** and clone it locally
2. **Install dependencies**: `npm install`
3. **Copy environment config**: `cp .env.example .env.local`
4. **Run the development server**: `npm run dev`

## Development Workflow

### Branch Strategy

- `main` - Stable release branch
- `dev` - Development branch (submit PRs here)
- Feature branches - Create from `dev` for new features

### Making Changes

1. Create a new branch from `dev`:
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following the code style guidelines below

3. Test your changes:
   - Run `npm run lint` to check for linting errors
   - Test with demo mode (`NEXT_PUBLIC_DEMO=true`)
   - If you have a Pentair system, test with real connections

4. Commit your changes with clear, descriptive messages

5. Push and create a Pull Request against `dev`

## Code Style Guidelines

### General

- Use TypeScript for all new code
- Follow existing patterns in the codebase
- Keep components focused and single-purpose
- Prefer functional components with hooks

### Naming Conventions

- **Files**: `kebab-case.ts` for utilities, `PascalCase.tsx` for components
- **Components**: PascalCase (`PoolStatus`, `CircuitToggle`)
- **Functions**: camelCase (`getPoolStatus`, `setCircuitState`)
- **Constants**: SCREAMING_SNAKE_CASE (`CONNECTION_TIMEOUT`)

### CSS/Styling

- Use Tailwind CSS for styling
- Follow the design system in `design-docs/DESIGN_SYSTEM.md`
- Mobile-first responsive design

## Pull Request Guidelines

### Before Submitting

- [ ] Code follows the project's style guidelines
- [ ] Self-reviewed the code for obvious issues
- [ ] Tested changes locally
- [ ] Updated documentation if needed
- [ ] No sensitive data (credentials, API keys) included

### PR Description

Please include:
- **Summary**: What does this PR do?
- **Motivation**: Why is this change needed?
- **Testing**: How did you test this?
- **Screenshots**: If UI changes, include before/after screenshots

## Reporting Issues

### Bug Reports

When reporting bugs, please include:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Your environment (OS, browser, Node version)
- Connection type (local/remote) if relevant

### Feature Requests

For feature requests, please describe:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Project Structure

```
plunge/
├── src/
│   ├── app/           # Next.js pages and API routes
│   ├── components/    # React components
│   └── lib/           # Utilities and core logic
├── public/            # Static assets
├── design-docs/       # Design documentation
└── docs/              # User documentation
```

## Questions?

Feel free to open an issue for any questions about contributing.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
