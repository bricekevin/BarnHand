# Test Progress Tracking - Quick Guide

## ✅ Services Restarted

Both API Gateway and ML Service have been restarted with the new code.

## 🎯 How to Test (Step-by-Step)

### Step 1: Open Browser

1. Navigate to http://localhost:3000
2. Press **F12** to open Developer Tools
3. Go to the **Console** tab

### Step 2: Record a NEW Chunk

1. Select any stream (e.g., stream_002 or stream_004)
2. Click **"Record Chunk"** button in the UI
3. Wait for recording to complete (5-7 seconds)

### Step 3: Watch for Progress

**In the Browser Console** you should see:

```javascript
📊 Chunk status poll: {
  chunk_id: '296a368b-e9f8-416f-8069-13a8d1d812c4',  ← UUID format!
  status: 'processing',
  frames_processed: 31,      ← Should increase!
  total_frames: 126,
  has_processed_video: false,
  has_detections: false
}

📊 Chunk status poll: {
  chunk_id: '296a368b-e9f8-416f-8069-13a8d1d812c4',
  status: 'processing',
  frames_processed: 61,      ← Increasing!
  total_frames: 126,
  ...
}
```

**In the UI** you should see (near the detection panel):

```
🔄 Processing: 31/126 frames
🔄 Processing: 61/126 frames
🔄 Processing: 91/126 frames
...
```

### Step 4: Watch for Auto-Switch

When processing completes, you should see:

```javascript
// Browser console:
✅ ML processing completed! Auto-switching to processed video...
```

And in the UI:

- ✅ Video automatically switches from raw to processed
- ✅ Detection summary panel appears
- ✅ Overlays (boxes, keypoints) are visible
- ✅ Badge shows "✓ Processed"

## 🐛 If It Doesn't Work

### Check 1: Is the chunk ID a UUID?

**Look in browser console** - the chunk_id should look like:

```
296a368b-e9f8-416f-8069-13a8d1d812c4  ← CORRECT (UUID)
```

NOT like:

```
chunk-1759976289373  ← WRONG (old timestamp format)
```

If you see the timestamp format, you're selecting an OLD chunk. Record a NEW one!

### Check 2: Is frames_processed showing?

If the console shows:

```javascript
frames_processed: undefined  ← WRONG
total_frames: undefined
```

Then the chunk IDs don't match. Check Redis:

```bash
# In terminal:
docker exec barnhand-redis-1 redis-cli keys "chunk:*:progress"

# You should see UUIDs like:
chunk:296a368b-e9f8-416f-8069-13a8d1d812c4:progress
```

### Check 3: Verify the chunk filename

**In terminal, check the most recent chunk:**

```bash
ls -lt /Users/kevinbrice/GIT/BarnHand/chunks/123e4567-e89b-12d3-a456-426614174010/stream_*/chunk*.mp4 | head -3
```

**You should see NEW format:**

```
chunk_stream_002_296a368b-e9f8-416f-8069-13a8d1d812c4.mp4  ← CORRECT!
```

**NOT old format:**

```
chunk_stream_002_1759976289373.mp4  ← OLD (won't work)
```

## 🔍 Watch Docker Logs (Optional)

**Terminal 1: ML Service**

```bash
docker compose logs -f ml-service | grep -E "✅ Initialized|📊 Redis progress"
```

You should see:

```
✅ Initialized Redis progress: chunk:296a368b-...:progress = 0/126
📊 Redis progress update: chunk:296a368b-...:progress = 31/126
📊 Redis progress update: chunk:296a368b-...:progress = 61/126
```

**Terminal 2: API Gateway**

```bash
docker compose logs -f api-gateway | grep -E "📤 Sending|FFmpeg"
```

You should see:

```
📤 Sending chunk_id to ML service { chunk_id: '296a368b-...' }
```

## ⚠️ Important Notes

1. **Old chunks won't work!** Only NEW chunks recorded after the restart will have the UUID format.

2. **Don't select old chunks** - They have the old timestamp-based IDs and won't show progress.

3. **The fix only applies to newly recorded chunks** - Existing chunks in the list won't work for progress tracking.

## ✅ Success Criteria

You'll know it's working when you see ALL of these:

1. ✅ Browser console shows chunk_id as UUID (not timestamp)
2. ✅ Browser console shows frames_processed increasing (31, 61, 91...)
3. ✅ UI badge shows "🔄 Processing: X/Y frames"
4. ✅ Video auto-switches when complete
5. ✅ Detection summary appears automatically
6. ✅ NO manual refresh needed!
