# 00 - Architecture and Flutter Project Setup

- **Status**: pending
- **Priority**: 🔴 Critical
- **Depends on**: none
- **Files**:
  - `packages/client_flutter/pubspec.yaml`
  - `packages/client_flutter/analysis_options.yaml`
  - `packages/client_flutter/lib/main.dart`
  - `package.json`

## Description

Establish the Flutter client package inside the monorepo (`packages/client_flutter`), configure strict linting rules, setup the reactive state management strategy (Riverpod or simple reactive streams/notifiers), and ensure headless CI test commands (`flutter test`) can be executed via npm scripts.

## Tasks

- [ ] Initialize `packages/client_flutter` as a Flutter application targeting macOS, Windows, Linux, iOS, and Android.
- [ ] Configure `pubspec.yaml` with essential dependencies:
  - State management & utilities (`flutter_riverpod` or lightweight reactive state).
  - Seeded random generation / math helpers.
  - Testing dependencies (`test`, `flutter_test`, `mocktail`).
- [ ] Setup `analysis_options.yaml` with strict linter rules for clean, idiomatic Dart.
- [ ] Add root npm scripts in `package.json`:
  - `npm run test:flutter`
  - `npm run dev:flutter`
- [ ] Verify `flutter test` runs and passes in headless/terminal environment.
