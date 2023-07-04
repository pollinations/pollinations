from ftlangdetect import detect
import argparse

parser = argparse.ArgumentParser(description='Detect language of text.')
parser.add_argument('text', metavar='text', type=str, nargs='+',
                    help='text to detect language of')

args = parser.parse_args()

text = ' '.join(args.text)
result = detect(text=text, low_memory=False)
print(result["lang"])