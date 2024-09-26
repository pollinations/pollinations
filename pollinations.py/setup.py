"""
Setup script for pollinations.ai

Variables:
    path_absolute (str): Absolute path to the directory containing the setup.py file
    version (str): Current version of the package

Functions:
    setup: Setup function for the package
"""

from setuptools import setup, find_packages
from pathlib import Path

path_absolute: Path = Path(__file__).parent.absolute()

with open(f"{path_absolute}/pollinations/__init__.py", "r") as file:
    for line in file.readlines():
        if line.startswith("__version__"):
            version = line.split("=")[1].strip()[1:-1]
            break

setup(
    name="pollinations",
    version=version,
    description="pollinations.ai | Image Generation",
    long_description=Path(f"{path_absolute}/README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://pollinations.ai/",
    author="git.pollinations.ai",
    author_email="git.pollinations.ai@gmail.com",
    license="MIT",
    classifiers=[
        "License :: OSI Approved :: MIT License",
        "Development Status :: 5 - Production/Stable",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python",
        "Topic :: Software Development :: Libraries",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "Topic :: Utilities",
        "Typing :: Typed",
    ],
    packages=find_packages(exclude=("tests",)),
    include_package_data=True,
    python_requires=">=3.7",
    keywords=["pollinations", "pollinations.ai", "pollinations-ai", "pollinations_ai"],
    project_urls={
        "Website": "https://pollinations.ai/",
        "Discord": "https://discord.gg/8HqSRhJVxn",
        "Github": "https://github.com/pollinations",
        "YouTube": "https://www.youtube.com/channel/UCk4yKnLnYfyUmCCbDzOZOug",
        "Instagram": "https://instagram.com/pollinations_ai",
        "Twitter": "https://twitter.com/pollinations_ai",
    },
)
