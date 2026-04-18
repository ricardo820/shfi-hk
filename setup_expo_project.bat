@echo off
rem =============================================================================
rem setup_expo_project.bat - Automated setup for Expo React Native (TypeScript) project
rem =============================================================================

set "PROJECT_NAME=myapp"
set "BASE_DIR=%~dp0"
set "PROJECT_DIR=%BASE_DIR%\%PROJECT_NAME%"

rem --- Helper functions -------------------------------------------------------
:check_command
where %1 >nul 2>&1
if %errorlevel% neq 0 (
  echo %1 not found in PATH. Please install it and ensure it is in your PATH.
  exit /b 1
)
exit /b 0

rem Ensure Node.js is installed
call :check_command node
if %errorlevel% neq 0 goto :eof

rem Ensure npm is installed
call :check_command npm
if %errorlevel% neq 0 goto :eof

rem Install expo-cli globally if missing
npm list -g expo-cli >nul 2>&1
if %errorlevel% neq 0 (
  echo Installing expo-cli globally...
  npm install -g expo-cli
) else (
  echo expo-cli is already installed.
)

rem Create new Expo project (blank template with TypeScript)
if exist "%PROJECT_DIR%" (
  echo Project folder "%PROJECT_DIR%" already exists. Please remove or rename it before proceeding.
  exit /b 1
)

echo Creating Expo project "%PROJECT_NAME%" with TypeScript template...
expo init "%PROJECT_NAME%" --template blank (typescript) --no-install

if %errorlevel% neq 0 (
  echo Expo project creation failed.
  exit /b 1
)

cd "%PROJECT_DIR%"

rem Install project dependencies
npm install

rem Add web support
expo install react-native-web

rem Add Redux Toolkit and React-Redux
npm install @reduxjs/toolkit react-redux

rem Add axios for API calls
npm install axios

rem Create src folder and core files
mkdir src

rem store.ts
(
  echo import { configureStore } from '@reduxjs/toolkit';
  echo import rootReducer from './reducers';
  echo.^
  echo export const store = configureStore({
  echo   reducer: rootReducer,
  echo });
  echo.^
  echo export type RootState = ReturnType<typeof store.getState>;
  echo export type AppDispatch = typeof store.dispatch;
) > src\store.ts

rem reducers/index.ts
(
  echo import { combineReducers } from '@reduxjs/toolkit';
  echo // Placeholder reducer – replace with real slices later
  echo const placeholder = (state = {}, action) => state;
  echo.^
  echo export default combineReducers({
  echo   placeholder,
  echo });
) > src\reducers\index.ts

rem api.ts
(
  echo import axios from 'axios';
  echo.^
  echo const api = axios.create({
  echo   baseURL: 'https://api.example.com', // TODO: update with real API URL
  echo   timeout: 10000,
  echo });
  echo.^
  echo export default api;
) > src\api.ts

rem Replace default App.tsx content
(
  echo import React from 'react';
  echo import { Provider } from 'react-redux';
  echo import { store } from './src/store';
  echo import { Text, View, StyleSheet } from 'react-native';
  echo.^
  echo export default function App() {
  echo   return (
  echo     <Provider store={store}>
  echo       <View style={styles.container}>
  echo         <Text>Welcome to My React Native App!</Text>
  echo       </View>
  echo     </Provider>
  echo   );
  echo }
  echo.^
  echo const styles = StyleSheet.create({
  echo   container: {
  echo     flex: 1,
  echo     justifyContent: 'center',
  echo     alignItems: 'center',
  echo     backgroundColor: '#f0f4f8',
  echo   },
  echo });
) > App.tsx

rem Initialise git repository (optional)
git init

echo Setup complete. To start development, run:

echo   cd "%PROJECT_DIR%"

echo   npm start

pause
