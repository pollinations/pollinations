"use client"

import PdfViewer from "@/components/PdfViewer"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import ChatViewer from "@/components/ChatViewer"

const Chat = () => {
  // States
  const [file, setFile] = useState<File | null>(null)
  const [chat, setChat] = useState<string[]>([])
  const [question, setQuestion] = useState<string>("")
  const [questionArray, setQuestionArray] = useState<string[]>([])
  const [submitLoading, setSubmitLoading] = useState<boolean>(false)

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Effects
  useEffect(() => {
    const getFile = async () => {
      const res = await fetch("/api/getFile")
      const blob = await res.blob();
      const file = new File([blob], "file.pdf", { type: "application/pdf" });
      setFile(file);
    }
    getFile();
  }, [])

  // Handlers
  const handleClose = () => {
    if (containerRef.current) {
      containerRef.current.style.display = "flex";
    }
  }
  const handleCancel = () => {
    if (containerRef.current) {
      containerRef.current.style.display = "none";
    }
  }
  const handleSubmit = async () => {
    setSubmitLoading(true);
    setChat((prev) => [...prev, ""]);
    if (!question.trim()) return;

    // Send messages as array (required by API)
    const payload = {
      messages: [{ role: "user", content: question }],
    };
    setQuestionArray((prev) => [...prev, question]);
    setQuestion("");
    const res = await fetch("/api/getAnswer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error("Error calling /api/getAnswer");
      return;
    }

    // Stream response (real-time chunks)
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) return;

    let fullResponse = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullResponse += chunk;


      setChat((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = fullResponse;
        return updated;
      });
    }
    setSubmitLoading(false);


  };

  const handleUpload = () => {
    router.push("/");
  }
  return (
    <main className="md:h-screen w-screen flex flex-col md:flex-row justify-center items-center">
      <section className="md:h-full md:w-1/2 w-[97%] bg-[#f2f4f7] ">
        <button className="fixed top-4 cursor-pointer md:left-[45%] right-2 text-3xl bg-white shadow-xl rounded-full w-12 h-12 font-extralight z-100 " onClick={handleClose}>x</button>
        <article className="overflow-auto md:h-[calc(100vh-100px)] h-[60vh] md:px-10 py-4">
          <ChatViewer chat={chat} questionArray={questionArray} />
        </article>
        <div className="w-full h-[70px] md:h-[100px] flex justify-evenly items-center gap-2 border-y-2 sm:border-y-2 border-gray-400">
          <input type="text" value={question} name="question" id="question" className="w-[90%] h-[60%] border-2 border-gray-400 rounded-2xl px-4 py-2" placeholder="Ask about the document" onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSubmit();
            }
          }} />

          <button type="submit" className="bg-black text-white text-2xl font-bold px-4 h-[60%] md:rounded-2xl rounded-full" onClick={handleSubmit} >
            {!submitLoading ? <Image src="/icons/send-4008.png" alt="send" width={50} height={50} className="md:w-[30px] w-[100%] invert" /> : <Image src="/icons/bouncing-circles-white.svg" alt="send" width={50} height={50} className="w-[20px]"
            />}
          </button>
        </div>
      </section>
      <section className="h-full w-full md:w-1/2 bg-white p-8 md:border-l-2 flex justify-center items-center">
        {file && <PdfViewer file={file} />}
      </section>
      <div ref={containerRef} className="hidden fixed top-0 md:h-screen md:w-screen size-full justify-center items-center">
        <div className="fixed h-screen w-screen opacity-20 bg-black flex justify-center items-center z-100">
        </div>
        <div className="fixed md:w-[550px] md:h-[300px] w-[97%] rounded-4xl px-10 max-md:py-10 bg-white z-500 flex flex-col justify-center items-start gap-6">
          <h1 className="text-2xl font-extrabold">Upload New PDF?</h1>
          <h3 className="text-lg font-normal">This will end your current chat session. Are you sure you want to upload a new PDF?</h3>
          <div className="flex w-full justify-end items-center gap-4">
            <button onClick={handleCancel}>Cancel</button>
            <button onClick={handleUpload} className="bg-black text-white rounded-4xl px-4 py-2">Upload</button>
          </div>
        </div>
      </div>
    </main>
  )
}

export default Chat