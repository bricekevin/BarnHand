# Phase 2: Behavioral Analysis Integration PRD

## Executive Summary
Integrate existing behavioral analysis components with upgraded MegaDescriptor ReID to create a complete behavioral analysis platform.

## Architecture Integration

**Current State**: Sophisticated behavioral models exist but aren't integrated
- ✅ Advanced horse tracking (`horse_tracker.py`)
- ✅ Comprehensive pose analysis (`pose_analysis.py`)
- ✅ State detection systems (`hierarchical_state_detection.py`)

**Phase 2 Goal**: Integration + Enhancement
- 🔧 Upgrade ReID model (CNN → MegaDescriptor)
- 🔧 Connect state detection to main processor
- 🔧 Add cross-chunk horse persistence

## Database Schema

Simple behavioral data storage:
- `horse_pose_frames` - Frame-level pose metrics 
- `horse_moments` - Detected behavioral moments
- `horse_actions` - Action states with duration
- TimescaleDB hypertables for time-series data

## Implementation Plan

**Week 1: Core Integration**
- Upgrade ReID model to MegaDescriptor  
- Connect existing state detection to processor
- Add cross-chunk horse persistence

**Week 2: Data & API Layer**
- Behavioral database tables
- API endpoints for timeline data
- WebSocket events for real-time updates

**Week 3: Frontend & Testing** 
- Behavioral timeline interface
- Testing framework with manual chunk processing
- Documentation and configuration

## API Endpoints

**New endpoints:**
- `GET /api/v1/horses/{id}/behavioral-timeline` - Action history
- `GET /api/v1/horses/{id}/current-action` - Current state
- WebSocket: `behavioral:update` events for real-time updates

## Success Criteria

- >95% horse re-identification accuracy with MegaDescriptor
- Cross-chunk horse persistence with <5% ID switching  
- Real-time behavioral updates via WebSocket
- Maintain >25 FPS processing performance
- Complete behavioral timeline interface