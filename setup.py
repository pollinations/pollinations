import pathlib
from setuptools import setup

# Python version
PYTHON_REQUIRED_MAJOR: int   = 3
PYTHON_MINIMUM_MINOR:  int   = 7

# The directory containing this file
HERE:   str = pathlib.Path(__file__).parent

# The text of the README file
README: str = (HERE / "README.md").read_text()

# This call to setup() does all the work
setup(
    name="pollinations",
    version="0.1.0",
    description="Make Google Colab Notebooks available as a Servbice",
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
        "Topic :: Scientific/Engineering :: Artificial Intelligence"
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.7",
    ],
    packages=["pollinations"],
    include_package_data=True,
    install_requires=["stomp-py"],
    # entry_points={
    #     "console_scripts": [
    #         "colabservice=reader.__main__:main",
    #     ]
    # },
)
