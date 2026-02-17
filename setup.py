from setuptools import setup, find_packages

setup(
    name="mallama",
    version="0.1.3",
    packages=find_packages(),
    include_package_data=True,
    install_requires=[
        "flask>=2.0.0",
        "requests>=2.28.0",
        "werkzeug>=2.0.0",
    ],
    entry_points={
        "console_scripts": [
            "mallama=mallama.__main__:main",
        ],
    },
    author="Masoud Gholypour",
    author_email="masoudgholypour2000@gmail.com",
    description="Browser UI for Ollama • Local LLM Interface • Web Chat Client for Local AI Models",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    url="https://github.com/mesut2ooo/mallama",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.8",
)