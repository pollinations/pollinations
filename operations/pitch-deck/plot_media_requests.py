import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import matplotlib.ticker as mticker

# Load the data
df = pd.read_csv('media/pollinations_media_requests_per_day.csv')

# Convert 'date' column to datetime objects
df['date'] = pd.to_datetime(df['date'])

# Convert 'media_requested' to millions
df['media_requested_millions'] = df['media_requested'] / 1_000_000

# Create the plot
fig, ax = plt.subplots(figsize=(12, 6))

# Plot the data
ax.plot(df['date'], df['media_requested_millions'], marker='.', linestyle='-')

# Format the x-axis to show months
ax.xaxis.set_major_locator(mdates.MonthLocator(interval=1))
ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m'))
plt.xticks(rotation=45)

# Format the y-axis to show millions with 'M' suffix
formatter = mticker.FormatStrFormatter('%.1fM')
ax.yaxis.set_major_formatter(formatter)

# Add labels and title
ax.set_xlabel('Date (Month)')
ax.set_ylabel('Media Requested per Day (Millions)')
ax.set_title('Pollinations Media Requests per Day Over Time')
ax.grid(True)

# Adjust layout and save the plot
plt.tight_layout()
plt.savefig('media_requests_per_day.png')

print("Graph saved as media_requests_per_day.png") 