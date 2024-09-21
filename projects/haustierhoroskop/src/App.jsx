import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import "./index.css";
import { usePollinationsText } from "@pollinations/react";

function App() {
  const [petImage, setPetImage] = useState(null);
  const [birthDate, setBirthDate] = useState("");
  const [horoscope, setHoroscope] = useState(null);

  const petDescription = usePollinationsText(
    petImage
      ? [
          {
            type: "text",
            text: "Describe the pet in this image suitable for an image generator. Include details such as breed, age, gender, and any distinguishing features.",
          },
          {
            type: "image_url",
            image_url: {
              url: petImage,
            },
          },
        ]
      : null,
    { seed: 42 }
  );

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setPetImage(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const generateHoroscope = () => {
    // Mock AI call for horoscope generation
    const mockHoroscope = {
      text: "Your furry friend is in for a treat! The stars align to bring joy and excitement. Expect lots of belly rubs and tasty snacks in the near future.",
      image: "https://example.com/mock-horoscope-image.jpg",
    };
    setHoroscope(mockHoroscope);
  };

  return (
    <div className="min-h-screen bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader>
          <CardTitle cflassName="text-3xl font-bold text-center text-purple-700">
            Pet Horoscope
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="pet-image" className="text-lg font-medium">
              Upload Your Pet's Image
            </Label>
            <Input
              id="pet-image"
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="cursor-pointer"
            />
            {petImage && (
              <img
                src={petImage}
                alt="Your pet"
                className="mt-2 rounded-lg max-h-48 mx-auto"
              />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="birth-date" className="text-lg font-medium">
              Pet's Birth Date
            </Label>
            <Input
              id="birth-date"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </div>
          <Button
            onClick={generateHoroscope}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
            disabled={!petImage || !birthDate}
          >
            Generate Horoscope
          </Button>
          {horoscope && (
            <div className="space-y-4">
              <Separator />
              <h3 className="text-xl font-semibold text-center text-purple-700">
                Your Pet's Horoscope
              </h3>
              <img
                src={horoscope.image}
                alt="Horoscope visualization"
                className="rounded-lg max-h-48 mx-auto"
              />
              <p className="text-center italic">{petDescription}</p>
              <p className="text-center italic">{horoscope.text}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
