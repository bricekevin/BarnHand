#!/usr/bin/env python3
"""
Test script to validate the advanced state detection configuration
"""

import sys
import os
import yaml
import tempfile
from pathlib import Path

# Set environment
os.environ['LOG_LEVEL'] = 'INFO'
os.environ['CONFIDENCE_THRESHOLD'] = '0.7'

sys.path.insert(0, 'src')

def test_config_creation():
    """Test that the config creation includes all required sections"""
    print("🔧 Testing config file creation...")
    
    # Simulate the processing server config creation
    from processing_server import create_config_file
    
    # Create a temporary config file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
        config_path = f.name
    
    # Create config with test parameters
    test_config = {
        'movement_threshold': 5,
        'confidence_threshold': 0.7
    }
    
    try:
        create_config_file(config_path, test_config)
        print("✅ Config file created successfully")
        
        # Load and validate the created config
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
        
        # Check required sections
        required_sections = [
            'single_frame',
            'temporal_analysis',
            'confidence_weights',
            'display'
        ]
        
        for section in required_sections:
            if section in config:
                print(f"✅ {section} section found")
            else:
                print(f"❌ {section} section missing")
                return False
        
        # Check specific pawing_detection section
        if 'pawing_detection' in config['temporal_analysis']:
            print("✅ pawing_detection section found")
            required_keys = ['pawing_frequency_range', 'pawing_min_cycles', 'pawing_amplitude_threshold', 'stationary_hoof_threshold']
            for key in required_keys:
                if key in config['temporal_analysis']['pawing_detection']:
                    print(f"  ✅ {key} found")
                else:
                    print(f"  ❌ {key} missing")
                    return False
        else:
            print("❌ pawing_detection section missing")
            return False
            
        return True
        
    except Exception as e:
        print(f"❌ Config creation failed: {e}")
        return False
    finally:
        # Cleanup
        try:
            os.unlink(config_path)
        except:
            pass

def test_state_detector_init():
    """Test that AdvancedStateDetector can initialize with created config"""
    print("\n🏗️ Testing AdvancedStateDetector initialization...")
    
    try:
        from src.models.advanced_state_detection import AdvancedStateDetector
        
        # Test with actual config file
        config_path = 'config/state_tracking_config.yaml'
        if Path(config_path).exists():
            detector = AdvancedStateDetector(config_path)
            print("✅ AdvancedStateDetector created with config file")
        else:
            print("⚠️ Config file not found, testing with defaults")
            detector = AdvancedStateDetector(None)
            print("✅ AdvancedStateDetector created with defaults")
            
        # Check if pawing_detection is accessible
        pawing_config = detector.config['temporal_analysis']['pawing_detection']
        print(f"✅ Pawing detection accessible: {list(pawing_config.keys())}")
        
        return True
        
    except Exception as e:
        print(f"❌ AdvancedStateDetector initialization failed: {e}")
        return False

def main():
    print("🐴 Advanced State Detection - Configuration Validation")
    print("=" * 60)
    
    success = True
    
    # Test all components
    success &= test_config_creation()
    success &= test_state_detector_init()
    
    print("\n" + "=" * 60)
    if success:
        print("🎉 All configuration tests passed!")
        print("💡 The pawing_detection KeyError should now be resolved")
    else:
        print("❌ Some configuration tests failed. Check the errors above.")
        
    return success

if __name__ == "__main__":
    main()