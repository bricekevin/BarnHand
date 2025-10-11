# Debug Progress Tracking - Console Guide

## What to Do

1. **Open Browser Console** (F12 → Console tab)
2. **Clear the console** (click the 🚫 icon or press Ctrl+L)
3. **Record a NEW chunk** (click "Record Chunk" button)
4. **Copy ALL the console output** and share it with me

## What You Should See

### During Recording (first 5-7 seconds)

Nothing special - just recording the video

### After Recording Completes

You should start seeing status polls every 2 seconds:

```javascript
📊 Chunk status poll: {
  chunk_id: '296a368b-e9f8-416f-8069-13a8d1d812c4',  ← Should be UUID!
  status: 'pending',                                  ← Starts as pending
  frames_processed: undefined,                        ← Initially undefined
  total_frames: undefined,
  has_processed_video: false,
  has_detections: false,
  raw_response: { ... }
}

⚠️ No progress data available  ← Expected at first

🔍 Status transition check: {
  prevStatus: null,
  currentStatus: 'pending',
  willAutoSwitch: false
}
```

### When ML Processing Starts

After a few seconds, you should see:

```javascript
📊 Chunk status poll: {
  chunk_id: '296a368b-...',
  status: 'processing',          ← Status changed to processing!
  frames_processed: 31,           ← Numbers appear!
  total_frames: 126,
  has_processed_video: false,
  has_detections: false,
  ...
}

✅ Setting progress: {             ← Progress is being set!
  frames_processed: 31,
  total_frames: 126
}

🔍 Status transition check: {
  prevStatus: 'pending',
  currentStatus: 'processing',
  willAutoSwitch: false
}
```

### Progress Updates

Every 2 seconds while processing:

```javascript
📊 Chunk status poll: {
  chunk_id: '296a368b-...',
  status: 'processing',
  frames_processed: 61,           ← Increasing!
  total_frames: 126,
  ...
}

✅ Setting progress: {
  frames_processed: 61,
  total_frames: 126
}
```

### When Processing Completes

```javascript
📊 Chunk status poll: {
  chunk_id: '296a368b-...',
  status: 'complete',             ← Status changed to complete!
  frames_processed: 126,
  total_frames: 126,
  has_processed_video: true,      ← Both should be true!
  has_detections: true,
  ...
}

⚠️ No progress data available     ← Expected when complete

🔍 Status transition check: {
  prevStatus: 'processing',       ← Was processing
  currentStatus: 'complete',      ← Now complete
  willAutoSwitch: true            ← Should trigger auto-switch!
}

✅ ML processing completed! Auto-switching to processed video...

🔄 Current state: {
  showRawVideo: false,
  selectedChunk: '296a368b-...',
  detectionDataKey: 0
}

✅ Auto-switch triggered!
```

## Common Issues & What They Mean

### Issue 1: chunk_id is timestamp format

```javascript
chunk_id: 'chunk-1759976289373'  ← WRONG!
```

**Cause**: You're viewing an OLD chunk recorded before the fix
**Solution**: Record a NEW chunk

### Issue 2: frames_processed always undefined

```javascript
status: 'processing',
frames_processed: undefined,     ← WRONG!
total_frames: undefined,
```

**Cause**: Chunk ID mismatch between frontend and ML service
**Check**: Look at docker logs to see if ML is using a different ID

### Issue 3: Status goes straight to 'complete'

```javascript
status: 'pending'   ← First poll
status: 'complete'  ← Second poll (skipped 'processing'!)
```

**Cause**: ML processed the chunk very fast, OR you're viewing a chunk that's already processed
**Solution**: Try recording a longer chunk (10 seconds)

### Issue 4: willAutoSwitch is false

```javascript
🔍 Status transition check: {
  prevStatus: null,              ← Previous status is null!
  currentStatus: 'complete',
  willAutoSwitch: false
}
```

**Cause**: The chunk was already complete when you selected it
**Solution**: Select the chunk IMMEDIATELY after recording, not an old one

### Issue 5: Auto-switch message doesn't appear

If you see `willAutoSwitch: true` but NO "✅ ML processing completed!" message:
**Cause**: JavaScript error preventing the code from running
**Check**: Look for red error messages in the console

## What to Share With Me

Please copy and paste:

1. **The first few status polls** (when chunk is first selected)
2. **Any status polls showing progress** (if you see frames_processed numbers)
3. **The status transition when it completes** (showing the auto-switch check)
4. **Any error messages** (shown in red)

This will help me identify exactly what's not working!
