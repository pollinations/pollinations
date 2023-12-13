import pathlib
from setuptools import setup

# Python version
PYTHON_REQUIRED_MAJOR: int = 3
PYTHON_MINIMUM_MINOR:  int = 7

# Pollinations version
POLLINATIONS_MAJOR:    int = 0
POLLINATIONS_MINOR:    int = 2
POLLINATIONS_PATCH:    int = 6

# The directory containing this file
HERE:   str = pathlib.Path(__file__).parent

# The text of the README file
README: str = (HERE / "README.md").read_text()

# This call to setup() does all the work
setup(
    name="pollinations",
    version=f"{POLLINATIONS_MAJOR}.{POLLINATIONS_MINOR}.{POLLINATIONS_PATCH}",
    description="(API) Interact with text2image ai generative models.",
    long_description=README,
    long_description_content_type="text/markdown",
    url="https://github.com/pollinations/pollinations",
    author="Pollination in Blatant Space (thomash)",
    author_email="t.haferlach@gmail.com",
    license="MIT",
    classifiers=[
        "Development Status :: 5 - Production/Stable",
        "Intended Audience :: Developers",
        "Intended Audience :: Science/Research",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
        "License :: OSI Approved :: MIT License",
        f"Programming Language :: Python :: {PYTHON_REQUIRED_MAJOR}",
        f"Programming Language :: Python :: {PYTHON_REQUIRED_MAJOR}.{PYTHON_MINIMUM_MINOR}",
    ],
    packages=["pollinations"],
    include_package_data=True,
    #install_requires=["stomp-py"],
    python_requires=f">={PYTHON_REQUIRED_MAJOR}.{PYTHON_MINIMUM_MINOR}",
    project_urls={
        'Pollinations': 'https://github.com/pollinations',
        'Source': 'https://github.com/pollinations/pollinations',
    }
    # entry_points={
    #     "console_scripts": [
    #         "colabservice=reader.__main__:main",
    #     ]
    # },
)
