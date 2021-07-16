import pathlib
from setuptools import setup

# The directory containing this file
HERE = pathlib.Path(__file__).parent

# The text of the README file
README = (HERE / "README.md").read_text()

# This call to setup() does all the work
setup(
    name="pollinations",
    version="1.0.0",
    description="Make Google Colab Notebooks available as a Service",
    long_description=README,
    long_description_content_type="text/markdown",
    url="https://github.com/pollinations/pollinations",
    author="Pollination in Blatant Space (thomash)",
    author_email="t.haferlach@gmail.com",
    license="MIT",
    classifiers=[
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.7",
    ],
    packages=["pollinations"],
    include_package_data=True,
    install_requires=[],
    # entry_points={
    #     "console_scripts": [
    #         "colabservice=reader.__main__:main",
    #     ]
    # },
)