import React from "react"
import { GeneralButton } from "../GeneralButton"
import { Colors, Fonts } from "../../config/global"
import { IMAGE_EDIT_BUTTON_ON, IMAGE_EDIT_BUTTON_OFF } from "../../config/copywrite"

export function GenerateButton({ handleButtonClick, isLoading }) {
  return (
    <GeneralButton
      handleClick={handleButtonClick}
      isLoading={isLoading}
      borderColor={Colors.lime}
      backgroundColor="transparent"
      textColor={Colors.lime}
    >
      {isLoading ? IMAGE_EDIT_BUTTON_ON : IMAGE_EDIT_BUTTON_OFF}
    </GeneralButton>
  )
}
