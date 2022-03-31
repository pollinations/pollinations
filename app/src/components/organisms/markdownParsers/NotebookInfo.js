import Markdown from 'markdown-to-jsx';

function NotebookInfo({ description, noImg }) {
  if (!description) return <></>;

  if (noImg) return <Markdown options={MarkDownOptions} children={description} />;

  return <Markdown children={description} />;
}

// surprise, it's a div instead!
const gambiarraImg = ({ children, ...props }) => (
  <div />
);
const MarkDownOptions = {
  overrides: {
    img: { component: gambiarraImg },
  },
};

export default NotebookInfo;
