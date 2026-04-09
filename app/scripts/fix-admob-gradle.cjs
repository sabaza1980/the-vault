#!/usr/bin/env node
// Fixes deprecated proguard file reference in @capacitor-community/admob
// Safe to run in any environment — silently skips if the file doesn't exist
const fs = require('fs');
const path = require('path');

const gradlePath = path.join(__dirname, '..', 'node_modules', '@capacitor-community', 'admob', 'android', 'build.gradle');

try {
  const original = fs.readFileSync(gradlePath, 'utf8');
  const fixed = original.replace(
    "getDefaultProguardFile('proguard-android.txt')",
    "getDefaultProguardFile('proguard-android-optimize.txt')"
  );
  if (original !== fixed) {
    fs.writeFileSync(gradlePath, fixed, 'utf8');
    console.log('✔ Fixed admob proguard file reference');
  }
} catch (e) {
  // File doesn't exist (e.g. Vercel, CI) — skip silently
}
