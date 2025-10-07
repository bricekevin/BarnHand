#!/usr/bin/env python3
"""
Timeline Analysis Script
Analyzes the generated timeline data to show detection patterns
"""

import json
import argparse
from collections import Counter, defaultdict
import numpy as np

def analyze_timeline(timeline_path: str):
    """Analyze timeline data and print summary"""
    
    with open(timeline_path, 'r') as f:
        timeline_data = json.load(f)
    
    print("="*50)
    print("HORSE STATE DETECTION ANALYSIS")
    print("="*50)
    print(f"Total frames analyzed: {len(timeline_data)}")
    
    # Group by horse
    horses = defaultdict(list)
    for entry in timeline_data:
        horses[entry['horse_id']].append(entry)
    
    print(f"Total horses tracked: {len(horses)}")
    print()
    
    # Analyze each horse
    for horse_id, entries in horses.items():
        print(f"🐴 HORSE #{horse_id}")
        print(f"   Frames with data: {len(entries)}")
        
        # Body states
        body_states = [entry['body_state']['state'] for entry in entries]
        body_state_counts = Counter(body_states)
        print(f"   Body states detected:")
        for state, count in body_state_counts.most_common():
            percentage = (count / len(entries)) * 100
            print(f"     {state.replace('_', ' ').title()}: {count} frames ({percentage:.1f}%)")
        
        # Head positions
        head_positions = [entry['head_position']['state'] for entry in entries]
        head_position_counts = Counter(head_positions)
        print(f"   Head positions detected:")
        for position, count in head_position_counts.most_common():
            percentage = (count / len(entries)) * 100
            print(f"     {position.replace('_', ' ').title()}: {count} frames ({percentage:.1f}%)")
        
        # Confidence analysis
        body_confidences = [entry['body_state']['confidence'] for entry in entries]
        head_confidences = [entry['head_position']['confidence'] for entry in entries]
        
        print(f"   Average body state confidence: {np.mean(body_confidences):.2f}")
        print(f"   Average head position confidence: {np.mean(head_confidences):.2f}")
        
        # Keypoint quality
        keypoint_counts = [entry['measurements']['keypoints_detected'] for entry in entries]
        avg_keypoint_conf = [entry['measurements']['avg_keypoint_confidence'] for entry in entries]
        
        print(f"   Average keypoints detected: {np.mean(keypoint_counts):.1f}/17")
        print(f"   Average keypoint confidence: {np.mean(avg_keypoint_conf):.2f}")
        
        # Check for alerts
        all_alerts = []
        for entry in entries:
            all_alerts.extend(entry.get('alerts', []))
        
        if all_alerts:
            alert_counts = Counter(all_alerts)
            print(f"   ⚠️ Alerts detected:")
            for alert, count in alert_counts.items():
                print(f"     {alert}: {count} times")
        else:
            print(f"   ✅ No concerning behaviors detected")
        
        print()
    
    # Overall summary
    print("="*50)
    print("OVERALL SUMMARY")
    print("="*50)
    
    all_body_states = [entry['body_state']['state'] for entry in timeline_data]
    all_head_positions = [entry['head_position']['state'] for entry in timeline_data]
    
    print("Most common body states across all horses:")
    for state, count in Counter(all_body_states).most_common():
        percentage = (count / len(timeline_data)) * 100
        print(f"  {state.replace('_', ' ').title()}: {percentage:.1f}%")
    
    print("\nMost common head positions across all horses:")
    for position, count in Counter(all_head_positions).most_common():
        percentage = (count / len(timeline_data)) * 100
        print(f"  {position.replace('_', ' ').title()}: {percentage:.1f}%")
    
    # Keypoint quality overall
    all_keypoint_counts = [entry['measurements']['keypoints_detected'] for entry in timeline_data]
    all_keypoint_conf = [entry['measurements']['avg_keypoint_confidence'] for entry in timeline_data]
    
    print(f"\nOverall keypoint quality:")
    print(f"  Average keypoints detected: {np.mean(all_keypoint_counts):.1f}/17")
    print(f"  Average keypoint confidence: {np.mean(all_keypoint_conf):.2f}")
    
    # Detection quality by frame
    frames_with_data = len(set(entry['frame_idx'] for entry in timeline_data))
    unique_horses = len(set(entry['horse_id'] for entry in timeline_data))
    
    print(f"\nDetection coverage:")
    print(f"  Frames with horse data: {frames_with_data}")
    print(f"  Unique horses identified: {unique_horses}")
    print(f"  Average detections per frame: {len(timeline_data) / frames_with_data:.1f}")

def main():
    parser = argparse.ArgumentParser(description='Analyze horse state detection timeline')
    parser.add_argument('timeline_file', help='Path to timeline JSON file')
    
    args = parser.parse_args()
    analyze_timeline(args.timeline_file)

if __name__ == "__main__":
    main()