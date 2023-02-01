import useSignUp from '../hooks/forms/useSignUp'
import SimpleForm from "../components/SimpleForm";

export default function SignUpPage(){

const SignUpProps = useSignUp()

return <SimpleForm {...SignUpProps} title='SignUp'/>
}