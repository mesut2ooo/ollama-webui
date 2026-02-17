#!/usr/bin/env python3
"""
Main entry point for the mallama package.
"""
import os
import sys
import argparse
from .app import app

def main():
    """Run the Ollama Web UI server."""
    parser = argparse.ArgumentParser(description="Ollama Web UI Server")
    parser.add_argument(
        "--host", 
        default="0.0.0.0",
        help="Host to bind to (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--port", 
        type=int, 
        default=5000,
        help="Port to bind to (default: 5000)"
    )
    parser.add_argument(
        "--debug", 
        action="store_true",
        help="Run in debug mode"
    )
    
    args = parser.parse_args()
    
    print(f"Starting Ollama Web UI on http://{args.host}:{args.port}")
    print("Press Ctrl+C to stop")
    
    # Create necessary directories
    os.makedirs(os.path.expanduser("~/.mallama/conversations"), exist_ok=True)
    os.makedirs(os.path.expanduser("~/.mallama/uploads"), exist_ok=True)
    
    # Update app config to use user directory
    app.config['UPLOAD_FOLDER'] = os.path.expanduser("~/.mallama/uploads")
    app.config['CONVERSATIONS_FOLDER'] = os.path.expanduser("~/.mallama/conversations")
    
    app.run(debug=args.debug, host=args.host, port=args.port)

if __name__ == "__main__":
    main()