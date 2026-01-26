import Homepage from "./components/pages/Homepage";
import Header from "./components/layout/Header";
import Footer from "./components/layout/Footer";

const App = () => {
  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-900">
      <Header />
      <main className="flex-grow flex flex-col">
        <Homepage />
      </main>
      <Footer />
    </div>
  );
};

export default App;
