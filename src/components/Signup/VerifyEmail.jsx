import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Leaf, LoaderCircle } from 'lucide-react';
import { apiVerifyEmail } from '../../api/client';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Verifying your email...');
  const hasStartedVerification = useRef(false);

  useEffect(() => {
    if (hasStartedVerification.current) return;
    hasStartedVerification.current = true;

    const token = searchParams.get('token');
    if (!token) {
      Promise.resolve().then(() => {
        setStatus('error');
        setMessage('This verification link is missing its token.');
      });
      return;
    }

    apiVerifyEmail(token)
      .then((response) => {
        setStatus('success');
        setMessage(response.message);
      })
      .catch((error) => {
        setStatus('error');
        setMessage(error.message);
      });
  }, [searchParams]);

  return (
    <div className="bg-[linear-gradient(180deg,#f3f8f3_0%,#ffffff_40%,#f4f7f3_100%)] px-6 py-10">
      <div className="mx-auto flex min-h-[65vh] max-w-lg items-center justify-center">
        <main className="w-full rounded-3xl border border-emerald-100 bg-white p-8 text-center shadow-sm sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            {status === 'loading' ? <LoaderCircle className="animate-spin" size={28} /> : status === 'success' ? <CheckCircle2 size={30} /> : <Leaf size={28} />}
          </div>
          <h1 className="mt-5 text-2xl font-bold text-gray-900">{status === 'success' ? 'Email verified' : status === 'error' ? 'Verification failed' : 'Verifying email'}</h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">{message}</p>
          {status !== 'loading' && (
            <Link to={status === 'success' ? '/login' : '/signup'} className="mt-6 inline-block rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">
              {status === 'success' ? 'Continue to login' : 'Back to signup'}
            </Link>
          )}
        </main>
      </div>
    </div>
  );
}
