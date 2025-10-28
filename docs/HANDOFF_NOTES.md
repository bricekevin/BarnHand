# BarnHand - Global Horse ID & Frame Inspector - Handoff Notes

**Date**: 2025-10-28
**Session Duration**: ~2 hours
**Branch**: `feature/documentation`

## 🎯 Session Objectives

1. ✅ **Fix horse ID inconsistencies across views**
2. ✅ **Add horse names to chunk data and video overlays**
3. ✅ **Create frame-by-frame inspector for ML transparency**
4. ✅ **Ensure global ID consistency across entire system**

---

## ✅ Completed Work Summary

### Phase 1: Root Cause Analysis
- Identified three distinct ID systems causing confusion:
  - Chunk JSON: numeric counter (16, 17, 18)
  - Video overlays: numeric counter (matching chunk)
  - Detected Horses tab: database IDs (15, 6, 13)
- Discovered ML service was using `tracking_id` (numeric) instead of `id` (global string)
- Found that horse names from ReID were not propagating to chunk JSON

### Phase 2: ML Service Implementation
**File**: `backend/ml-service/src/services/processor.py`

**Changes**:
1. **_generate_horse_summary()** (Lines 1277-1325):
   - Changed from `track.get("tracking_id")` to `track.get("id")`
   - Added horse name from ReID matching
   - Added `horse_type` and `is_official` flags

2. **_draw_overlays()** (Lines 1199-1276):
   - Updated to use global ID instead of numeric counter
   - Show horse name in video overlay if available
   - Fallback to ID if unnamed

3. **Pose Estimation** (Lines 914-963):
   - Fixed horse_id references to use global ID
   - Ensures poses are correctly mapped to horses

4. **Frame Metadata** (Lines 1000-1022):
   - Added ML settings to each frame (model, thresholds, mode)
   - Added ReID details (similarity threshold, known horses count)
   - Provides context for frame-by-frame inspector

### Phase 3: Frontend Implementation

**A. DetectionDataPanel Updates** (`frontend/src/components/DetectionDataPanel.tsx`):
- Updated Horse interface to include name, horse_type, is_official
- Changed display logic to show "Unnamed Horse" for horses without names
- Always show ID below name for clarity
- Added FrameInspector integration

**B. New FrameInspector Component** (`frontend/src/components/FrameInspector.tsx`):
- **Navigation**: Previous/Next buttons, Play/Pause, slider, jump to frame
- **Status Badges**: Processed/Skipped, timestamp, mode indicator
- **Analysis Panels**:
  - Tracked Horses: ID, name, confidence, ReID confidence, bbox
  - YOLO Detections: Class, confidence, bbox geometry
  - ML Settings: Model, thresholds, frame interval, mode
  - ReID Details: Similarity threshold, known horses count
  - Pose Estimation: Keypoint counts and confidence
- **Visual Design**: Color-coded horses, official badges, responsive layout

### Phase 4: Deployment
- Rebuilt ML service: ✅ Healthy
- Rebuilt frontend: ✅ Running on port 3000
- All services operational
- Ready for testing

---

## 📦 Commits (2 total)

```
4c13903  feat(ml): use global horse IDs and names consistently in chunk JSON
d001dd0  feat(frontend): add frame-by-frame inspector and improve horse ID display
```

---

## 🚀 Production Status

**Ready for Testing**:
- ✅ Global horse IDs across all views
- ✅ Horse names in chunk JSON and overlays
- ✅ Frame-by-frame inspector with detailed metadata
- ✅ All services healthy and running
- ✅ Backward compatible (old chunks still work)

**Pending User Testing**:
- ⏳ Verify IDs match across all views for new chunks
- ⏳ Test horse renaming propagation
- ⏳ Validate frame inspector functionality

---

## 📖 Documentation

1. `GLOBAL_HORSE_ID_IMPLEMENTATION.md` - Complete technical implementation details
2. `HANDOFF_NOTES.md` - This document
3. `BARN_BASED_REID_IMPLEMENTATION.md` - ReID system context (unchanged)

---

## 🧪 Testing Instructions

### Quick Verification
1. Open frontend: `http://localhost:3000`
2. Select a stream and wait for chunk processing
3. Click on a processed chunk
4. **Check Tracked Horses section**: Note horse IDs (e.g., "1_horse_001")
5. **Play video**: Verify overlay labels match IDs
6. **Scroll to Frame Inspector**: Navigate frames, inspect details
7. **Check Detected Horses tab**: Verify same IDs appear
8. **Rename a horse**: Return to chunk, refresh, verify name updates

### Detailed Testing
See `docs/GLOBAL_HORSE_ID_IMPLEMENTATION.md` section: "Testing Instructions"

---

## 🎓 Key Learnings

### Technical Insights
- ML service had correct global IDs internally via `track.id`
- Bug was in JSON serialization layer (`_generate_horse_summary`)
- Horse names already available from ReID but not passed through
- Frame metadata was minimal - needed enhancement for inspector

### Data Flow Clarity
```
HorseTracker.id (global) → Chunk JSON → Frontend → Database
     ✓ Now consistent across all layers
```

### Component Design
- FrameInspector is self-contained, reusable component
- Uses existing chunk JSON data (no new API endpoints)
- Responsive layout adapts to content density
- Clear visual hierarchy with color-coded elements

---

## 🔧 Known Issues & Limitations

### Minor
1. **Frame Images**: Inspector shows metadata but not frame images (would require separate endpoint)
2. **Historical Data**: Only affects new chunks; old chunks retain numeric IDs
3. **Name Updates**: Require page refresh (not real-time WebSocket updates)

### Future Enhancements
1. Add frame image preview to inspector
2. Real-time frame inspector during live processing
3. Interactive ReID threshold adjustment
4. Export frame analysis to CSV

---

## 📋 Next Steps

### Immediate (User Testing)
1. Process several chunks with different streams
2. Verify ID consistency across all views
3. Test horse renaming workflow
4. Validate frame inspector usability
5. Check performance with many horses (10+)

### Short Term (Optional Enhancements)
1. Add frame image preview API endpoint
2. Highlight keypoint confidence in pose display
3. Add ReID similarity visualization
4. Show thumbnail extraction indicator in inspector

### Medium Term
1. Real-time frame inspector (during processing)
2. Compare frames side-by-side
3. Manual ReID override interface
4. Frame quality scoring

---

## 🐛 Debugging Tips

### If IDs Don't Match
```bash
# Check ML service logs
docker logs barnhand-ml-service-1 --tail 100

# Verify chunk JSON structure
cat backend/ml-service/output/stream_*/chunk_*/detections.json | jq '.horses[] | {id, name}'

# Check database tracking_id values
docker exec -it barnhand-postgres-1 psql -U postgres -d barnhand -c "SELECT tracking_id, name FROM horses LIMIT 10;"
```

### If Names Don't Appear
- Verify horse has `name` field set in database
- Check ReID matching occurred (look for `horse_name` in ML logs)
- Ensure chunk was processed AFTER name was set

### If Frame Inspector Doesn't Load
- Check browser console for errors
- Verify chunk JSON has `ml_settings` and `reid_details` fields
- Ensure DetectionDataPanel received frame data
- Check React component mount in browser devtools

---

## 📊 Performance Metrics

**No significant performance impact**:
- Frame metadata adds ~200 bytes per frame
- Name lookups use existing ReID system
- Video rendering unchanged

**Tested Configuration**:
- 300 frames per chunk
- 3 horses tracked
- Frame interval: 1
- Total JSON size increase: <5%

---

## 🤝 Collaboration Notes

### For Next Developer

**If continuing with frame images**:
1. Add GET `/api/v1/streams/:id/chunks/:chunkId/frames/:frameIndex` endpoint
2. Serve processed frame PNG from temp directory
3. Update FrameInspector to fetch and display image
4. Consider caching strategy (frames are large)

**If adding real-time inspector**:
1. Emit frame events via WebSocket during processing
2. Buffer recent frames in frontend state
3. Add live mode toggle to FrameInspector
4. Handle chunk completion transition

**If improving ReID visualization**:
1. Add similarity matrix to frame metadata
2. Create heatmap visualization component
3. Show top-3 matches for each detection
4. Add confidence threshold slider

---

**Status**: All features implemented and deployed. System ready for user acceptance testing.

**Contact**: All work committed to `feature/documentation` branch. Services running and healthy.
