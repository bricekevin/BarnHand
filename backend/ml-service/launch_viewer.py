#!/usr/bin/env python3
"""
Launch the Horse State Detection Timeline Viewer
Opens the web interface for analyzing timeline data
"""

import os
import webbrowser
import http.server
import socketserver
import threading
import time
from pathlib import Path

def start_server(port=8080):
    """Start a simple HTTP server for the viewer"""
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(Path(__file__).parent), **kwargs)
    
    try:
        with socketserver.TCPServer(("", port), Handler) as httpd:
            print(f"🌐 Starting web server on http://localhost:{port}")
            print(f"📊 Timeline viewer will open automatically...")
            print(f"📁 Serving files from: {Path(__file__).parent}")
            print()
            print("Available files:")
            
            # List available video and timeline files
            video_files = list(Path('.').glob('*.mp4'))
            timeline_files = list(Path('.').glob('*timeline*.json'))
            
            print("📹 Videos:")
            for video in video_files:
                print(f"   - {video.name}")
            
            print("📊 Timeline files:")
            for timeline in timeline_files:
                print(f"   - {timeline.name}")
            
            print()
            print("💡 Usage:")
            print("   1. Load video and timeline JSON files in the web interface")
            print("   2. Click 'Load & Analyze' to view synchronized playback")
            print("   3. Toggle horses on/off to focus analysis")
            print("   4. Use video controls to navigate timeline")
            print("   5. Export analysis report when done")
            print()
            print("🛑 Press Ctrl+C to stop server")
            
            # Open browser after short delay
            def open_browser():
                time.sleep(2)
                webbrowser.open(f"http://localhost:{port}/timeline_viewer.html")
            
            browser_thread = threading.Thread(target=open_browser)
            browser_thread.daemon = True
            browser_thread.start()
            
            httpd.serve_forever()
            
    except KeyboardInterrupt:
        print("\n🛑 Server stopped")
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"❌ Port {port} is already in use. Trying port {port + 1}...")
            start_server(port + 1)
        else:
            print(f"❌ Error starting server: {e}")

if __name__ == "__main__":
    print("🐴 Horse State Detection Timeline Viewer Launcher")
    print("=" * 50)
    start_server()