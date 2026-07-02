# ingest/invoices/parsers package
from . import automat_it, stripe_receipt, generic

# Ordered: specific parsers first; generic always matches last
REGISTRY = [automat_it, stripe_receipt, generic]
