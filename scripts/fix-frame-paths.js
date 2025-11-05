#!/usr/bin/env node

/**
 * Fix frame_path in existing chunk JSON files
 * Removes the duplicate "frames/" prefix from frame_path values
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const CHUNK_STORAGE_PATH = process.env.CHUNK_STORAGE_PATH || '/app/chunks';

function fixFramePaths(jsonFilePath) {
  try {
    console.log(`Processing: ${jsonFilePath}`);

    // Read JSON file
    const data = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

    // Check if frames exist and need fixing
    if (!data.frames || !Array.isArray(data.frames)) {
      console.log('  No frames found, skipping');
      return;
    }

    let fixedCount = 0;

    // Fix each frame's frame_path
    data.frames.forEach(frame => {
      if (frame.frame_path && frame.frame_path.startsWith('frames/')) {
        // Remove the "frames/" prefix
        frame.frame_path = frame.frame_path.replace(/^frames\//, '');
        fixedCount++;
      }
    });

    if (fixedCount > 0) {
      // Write back to file
      fs.writeFileSync(jsonFilePath, JSON.stringify(data, null, 2));
      console.log(`  ✓ Fixed ${fixedCount} frame paths`);
    } else {
      console.log('  No fixes needed');
    }

  } catch (error) {
    console.error(`  ✗ Error processing ${jsonFilePath}:`, error.message);
  }
}

function main() {
  console.log('Fixing frame_path in chunk JSON files...\n');

  // Find all detection JSON files
  const pattern = path.join(CHUNK_STORAGE_PATH, '**/*_detections.json');
  const files = glob.sync(pattern);

  console.log(`Found ${files.length} detection files\n`);

  files.forEach(fixFramePaths);

  console.log('\nDone!');
}

main();
