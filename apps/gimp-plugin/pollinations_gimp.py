#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pollinations AI GIMP 3 Plug-in
Generates and edits images directly inside GIMP 3 using Pollinations AI models and BYOP device authentication.
"""

import os
import sys

# Ensure local core packages are importable when plugin is executed by GIMP
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pollinations_core.ui import PollinationsDialog, HAS_GTK
from pollinations_core.gimp_utils import add_image_bytes_as_new_layer, HAS_GIMP

PLUG_IN_PROC = "pollinations-ai-image-generator"
PLUG_IN_BINARY = "pollinations_gimp"

if HAS_GIMP:
    import gi
    gi.require_version('Gimp', '3.0')
    gi.require_version('GimpUi', '3.0')
    from gi.repository import Gimp, GimpUi


def _(message: str) -> str:
    return message


class PollinationsPlugin(Gimp.PlugIn if HAS_GIMP else object):
    """GIMP 3 PlugIn implementation for Pollinations AI."""

    def do_set_i18n(self, procname: str):
        return True, "gimp30-python", None

    def do_query_procedures(self):
        return [PLUG_IN_PROC]

    def do_create_procedure(self, name: str):
        if name != PLUG_IN_PROC:
            return None

        procedure = Gimp.ImageProcedure.new(
            self,
            name,
            Gimp.PDBProcType.PLUGIN,
            self.run,
            None
        )

        procedure.set_image_types("*")
        procedure.set_sensitivity_mask(
            Gimp.ProcedureSensitivityMask.DRAWABLE |
            Gimp.ProcedureSensitivityMask.DRAWABLES |
            Gimp.ProcedureSensitivityMask.NO_DRAWABLES |
            Gimp.ProcedureSensitivityMask.NO_IMAGE
        )

        procedure.set_documentation(
            _("Pollinations AI Image Generator & Editor"),
            _("Generate and edit images inside GIMP 3 using Pollinations AI and BYOP device flow authentication."),
            name
        )

        procedure.set_menu_label(_("Pollinations AI Generator & Editor..."))
        procedure.set_attribution("Pollinations AI", "Pollinations AI Community", "2025")
        procedure.add_menu_path("<Image>/Pollinations AI")

        return procedure

    def run(self, procedure, run_mode, image, drawables, config, data):
        drawable = drawables[0] if drawables and len(drawables) > 0 else None

        if run_mode == Gimp.RunMode.INTERACTIVE and HAS_GTK:
            GimpUi.init(PLUG_IN_BINARY)
            dialog = PollinationsDialog(image=image, drawable=drawable)
            response, image_bytes = dialog.run()

            if response != 1 and response != -5:  # Gtk.ResponseType.OK is -5 or 1 depending on setup
                # User cancelled or closed dialog
                return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, None)

            if not image_bytes:
                return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, None)

            # Insert generated image as a new layer
            if image is not None:
                image.undo_group_start()
                try:
                    add_image_bytes_as_new_layer(image, image_bytes, layer_name="Pollinations AI Result")
                finally:
                    image.undo_group_end()
            else:
                add_image_bytes_as_new_layer(None, image_bytes, layer_name="Pollinations AI Result")

            return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)

        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)


if __name__ == "__main__" and HAS_GIMP:
    Gimp.main(PollinationsPlugin.__gtype__, sys.argv)
