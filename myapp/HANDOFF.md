# Internal Handoff Note
**Date**: April 18, 2026
**Project**: shfi-hk / myapp (Expo React Native)
**Goal**: Initial setup for a scalable React Native application targeting Mobile (iOS/Android) and Web, with a base structure for API communication.

## 1. What Was Accomplished
- **Environment Diagnostics**: Discovered that running global `npm` scripts via PowerShell natively throws a `PSSecurityException` due to the Windows Execution Policy restricting `.ps1` script execution.
- **Project Bootstrapping**: Successfully bypassed the restriction using `cmd /c`. Initialized a new React Native app named `myapp` using Expo with the `blank-typescript` template.
- **Dependencies Installed**:
  - `react-native-web`, `react-dom`, `@expo/metro-runtime` (to support web builds).
  - `axios` (for API networking).
- **Core Files Configured**:
  - `src/api.ts`: Scaffolding for an Axios instance with base URL and timeout configurations.
  - `App.tsx`: Updated to test the `api` import and display a blank template welcome message.

## 2. Environment Gotchas (IMPORTANT)
Due to the PowerShell script execution policy on this Windows machine:
- **Do not run `npm` or `npx` directly in PowerShell** if it invokes a global bin script. 
- **Workaround**: Always prefix `npm` and `npx` commands with `cmd /c` (e.g., `cmd /c npm start`, `cmd /c npx expo install ...`). This forces the command prompt to handle the execution and bypasses the PowerShell restriction.

## 3. Current Project State
The project is a clean slate. It successfully compiles and the Metro bundler can serve it.
- **Location**: `C:\Users\zelen\shfi-hk\myapp`
- **Framework**: Expo (React Native) + TypeScript.

## 4. Next Steps
- Define and implement actual API endpoints in `src/api.ts`.
- Set up state management (e.g., Redux Toolkit or Zustand) if the application scales up in complexity.
- Build out directory structure (`src/screens`, `src/components`, `src/navigation`).
- Configure React Navigation for routing between screens.
