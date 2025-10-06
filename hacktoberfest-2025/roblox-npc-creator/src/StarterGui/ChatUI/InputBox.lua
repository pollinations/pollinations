-- InputBox properties
-- This file defines a TextBox for user input

return function()
	local textBox = Instance.new("TextBox")
	textBox.Name = "InputBox"
	textBox.Size = UDim2.new(0.6, 0, 0, 40)
	textBox.Position = UDim2.new(0.2, 0, 0.7, 0)
	textBox.AnchorPoint = Vector2.new(0, 0)
	textBox.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
	textBox.BorderColor3 = Color3.fromRGB(0, 0, 0)
	textBox.BorderSizePixel = 2
	textBox.Font = Enum.Font.SourceSans
	textBox.TextSize = 18
	textBox.TextColor3 = Color3.fromRGB(0, 0, 0)
	textBox.PlaceholderText = "Type your message here..."
	textBox.Text = ""
	textBox.ClearTextOnFocus = false
	textBox.TextXAlignment = Enum.TextXAlignment.Left
	
	return textBox
end
