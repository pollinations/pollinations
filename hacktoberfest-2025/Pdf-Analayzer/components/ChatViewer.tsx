import { Fragment } from "react"
import Image from "next/image"


const ChatViewer = ({ chat, questionArray }: { chat: string[], questionArray: string[] }) => {
    return (
        <>
            {chat.length > 0 ? chat.map((message, idx) => {

                if (message.length > 0) {

                    return <Fragment key={idx}>
                        <div className="w-[97%] md:w-[80%] font-bold my-2 text-black bg-white rounded-xl py-4 px-10 flex gap-4">
                            {questionArray[idx]}
                        </div>
                        <div className="w-[97%] md:w-[80%] my-2 text-purple-600 bg-white rounded-xl py-4 px-10">
                            <p className="text-sm font-bold ">{message}</p>
                        </div>
                    </Fragment>
                } else {
                    return <Fragment key={idx}>
                        <div className="w-[97%] md:w-[80%] font-bold my-2 text-black bg-white rounded-xl py-4 px-10 flex gap-4">
                            {questionArray[idx]}
                        </div>
                        <div key={idx} className="w-[97%] md:w-[80%] my-2 text-purple-600 bg-white rounded-xl py-4 px-10 flex flex-col ">
                            <Image src={"/icons/bouncing-circles-white.svg"} alt="send" width={50} height={50} className="w-[30px] invert" />
                        </div>
                    </Fragment>
                }
            }
            ) : <div className="w-[97%] md:w-[80%] my-2 text-purple-600 bg-white rounded-xl py-4 md:px-10 px-4 shadow-2xl  flex flex-col gap-4 ">
                <h1 className="text-xl md:text-2xl font-extrabold text-purple-800">You document is ready !</h1>
                <div className="md:text-lg font-bold">
                    You can now ask questions about your document. For example:
                    <ul className="list-disc ml-6 md:ml-10 font-normal flex flex-col gap-2">
                        <li>&quot; What is the main topic of this document? &quot;</li>
                        <li>&quot; Can you summarize the key points? &quot;</li>
                        <li>&quot; What are the conclusions or recommendations? &quot;</li>
                    </ul>
                </div>
            </div>
            }
        </>
    )
}

export default ChatViewer