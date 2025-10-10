"use client"
import { useRef,useState,Fragment } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

const UploadBox = () => {
    const router = useRouter();
    const [loading, setLoading] = useState<boolean>(false);
    const FileRef = useRef<HTMLInputElement>(null);
    const clicked = useRef<boolean>(false);
    const handleClick = () => {
            if (clicked.current) return;
            clicked.current = true;

            console.log("clicked");
            FileRef.current?.click();

            // Unlock after 500ms (or after dialog closes, if needed)
            setTimeout(() => {
                clicked.current = false;
            }, 500);
    }
    const handleCHange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        setLoading(true);
        const file = e.target.files?.[0];

        if (file) {
            const form = new FormData();

            form.append("File", file);

            const res = await  fetch("/api/upload", {
                method: "POST",
                body: form
            })
            if(res.ok) {
                router.push("/chat")
            }else{
                alert("something went wrong")
            }
            setLoading(false);
        }
    }
    return (
        <main className='md:w-[400px] md:h-[250px] bg-[#fffefe] shadow-lg rounded-2xl p-10 md:p-4 flex flex-col justify-center items-center ' onClick={handleClick}>
            {loading ? <h1 className='text-xl font-extrabold text-purple-800'>
                <Image src={"/icons/bouncing-circles-white.svg"} alt="send" width={50} height={50} className="w-[50px] invert" />
            </h1> : <Fragment>
            <Image src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA7UlEQVR4nO3W3QqCQBCG4fcqWun+ryRP6qiC6OdqJoQJllCz2GBGvheWhGidJ0uE/7fxlboOuPoajlNWgAtgvh7AluQIy4jpgJsP/nqtj28ZfmaluhJ3//ZfkE31XugrU0YQVBAyYMoE4h0SGlNmEGOQsJjzhz/xGOT9pnAiQAfgOHMnmoLgnxkQexJkM5BUmSDBEqRltnD1C/aYqv/iPD+39AS7BXuEgKTfwyIMgSDBhkCQYEMgSLAhECTYEAgSbAgECTYEQSD9h8f8NJAWmSCeII0zQTxBGmeCeII0zgTxBGmcCbJWiAVZrB7yBEinVIVHyL3uAAAAAElFTkSuQmCC" alt="upload--v1" width={50} height={50} className="w-[40px] my-4" />
            <h1 className='text-xl font-extrabold'>Upload PDF to start chatting</h1>
            <h3 className='text-lg text-gray-500'>click or drag and drop your file here</h3>
                <input type="file" accept=".pdf" name="File" id="File" ref={FileRef} onChange={handleCHange} className='hidden' />
            </Fragment>}
        </main>
    )
}

export default UploadBox