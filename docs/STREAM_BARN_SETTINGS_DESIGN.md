# Stream-to-Barn Settings Page Design

## Overview

Admin settings page for managing stream-to-barn (farm) assignments, providing a self-service interface for viewing and updating which streams belong to which barns.

## User Story

**As a farm administrator**, I want to:
- View all my farms (barns) and their assigned streams
- See which streams are active/inactive
- See how many horses are detected per stream
- Reassign streams to different farms
- Verify stream-to-barn relationships are correct

## Page Layout

### 1. Header Section
```
┌─────────────────────────────────────────────────────────┐
│ Stream & Barn Management                                │
│ Configure which video streams belong to which barns     │
│                                                         │
│ [+ Add New Stream]                                      │
└─────────────────────────────────────────────────────────┘
```

### 2. Farm Cards Grid (Responsive)
```
┌──────────────────────────────┐  ┌──────────────────────────────┐
│ 🏛️ Default Farm              │  │ 🏛️ North Barn                │
│ ──────────────────────────── │  │ ──────────────────────────── │
│ 4 Streams │ 12 Horses        │  │ 2 Streams │ 5 Horses         │
│                              │  │                              │
│ Streams:                     │  │ Streams:                     │
│ ┌──────────────────────────┐ │  │ ┌──────────────────────────┐ │
│ │ 📹 Stream 1              │ │  │ │ 📹 Stream 5              │ │
│ │ ● Active │ 3 horses      │ │  │ │ ○ Inactive │ 0 horses   │ │
│ │ [Edit] [Reassign]        │ │  │ │ [Edit] [Reassign]        │ │
│ └──────────────────────────┘ │  │ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │  │                              │
│ │ 📹 Stream 2              │ │  │                              │
│ │ ● Active │ 2 horses      │ │  │                              │
│ │ [Edit] [Reassign]        │ │  │                              │
│ └──────────────────────────┘ │  │                              │
│ ...                          │  │                              │
└──────────────────────────────┘  └──────────────────────────────┘
```

### 3. Stream Reassignment Modal
```
┌─────────────────────────────────────────────┐
│ Reassign Stream to Different Barn           │
│                                             │
│ Stream: Stream 1                            │
│ Current Barn: Default Farm                  │
│                                             │
│ New Barn:                                   │
│ ┌─────────────────────────────────────────┐ │
│ │ [v] Select Barn                        ▼ │ │
│ │     • Default Farm (current)            │ │
│ │     • North Barn                        │ │
│ │     • South Barn                        │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ⚠️  Warning: 3 horses will be reassigned    │
│                                             │
│ [Cancel]           [Reassign Stream]        │
└─────────────────────────────────────────────┘
```

## API Endpoints

### GET /api/v1/settings/stream-management
Response:
```json
{
  "farms": [
    {
      "id": "uuid",
      "name": "Default Farm",
      "streamCount": 4,
      "horseCount": 12,
      "streams": [
        {
          "id": "stream_001",
          "name": "Stream 1",
          "status": "active",
          "horseCount": 3,
          "last_activity": "2025-10-15T12:30:00Z"
        }
      ]
    }
  ]
}
```

### PATCH /api/v1/streams/:streamId/farm
Request:
```json
{
  "farmId": "new-farm-uuid"
}
```
Response:
```json
{
  "stream": {...},
  "horsesReassigned": 3,
  "message": "Stream reassigned successfully"
}
```

## Component Structure

```
StreamSettings/
├── StreamSettings.tsx         # Main container
├── FarmCard.tsx              # Farm summary card
├── StreamListItem.tsx        # Individual stream in list
├── ReassignStreamModal.tsx   # Reassignment modal
└── __tests__/
    ├── StreamSettings.test.tsx
    ├── FarmCard.test.tsx
    └── ReassignStreamModal.test.tsx
```

## State Management

```typescript
interface StreamSettingsState {
  farms: Farm[];
  loading: boolean;
  error: string | null;
  reassignModal: {
    isOpen: boolean;
    stream: Stream | null;
    targetFarmId: string | null;
  };
}
```

## User Flows

### Flow 1: View Stream Assignments
1. Navigate to Settings → Stream Management
2. See all farms with their streams
3. View status and horse counts

### Flow 2: Reassign Stream
1. Click "Reassign" on a stream
2. Modal opens showing current and available farms
3. Select new farm from dropdown
4. See warning about horses being reassigned
5. Confirm reassignment
6. Stream and horses move to new farm
7. UI updates to reflect changes

### Flow 3: Add New Stream
1. Click "+ Add New Stream"
2. Modal opens with stream configuration form
3. Fill in stream URL, name, and farm assignment
4. Save stream
5. Stream appears in assigned farm's card

## Security & Validation

- ✅ Require FARM_ADMIN or SUPER_ADMIN role
- ✅ Verify user has access to both source and target farms
- ✅ Prevent reassigning streams to non-existent farms
- ✅ Show confirmation for operations affecting horses
- ✅ Log all reassignment operations for audit trail

## Styling

- Use existing glass morphism design system
- Forest/nature theme colors
- Responsive grid layout (1 col mobile, 2 col tablet, 3 col desktop)
- Smooth animations for reassignment
- Clear visual feedback for actions

## Accessibility

- Keyboard navigation support
- ARIA labels for screen readers
- Focus management in modals
- Clear error messages
- Confirmation dialogs for destructive actions

## Testing Scenarios

1. **View**: Load page, see all farms and streams
2. **Reassign**: Move stream from Farm A to Farm B
3. **Validation**: Try reassigning to non-existent farm (fail gracefully)
4. **Authorization**: Non-admin user cannot access (403)
5. **Real-time**: Changes reflect immediately without refresh
6. **Error Handling**: API failure shows user-friendly error

## Future Enhancements

- [ ] Bulk reassignment (select multiple streams)
- [ ] Drag-and-drop to reassign streams
- [ ] Stream health monitoring visualization
- [ ] Historical reassignment logs
- [ ] Export stream assignments to CSV
