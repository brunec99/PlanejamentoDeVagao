import Link from 'next/link';

// Página pública (fora do login, ver o matcher de src/proxy.ts). O Google exige uma política de
// privacidade num domínio autorizado para publicar o app "Sistemas ATR" da tela de consentimento,
// que serve ao Obra 360, ao Takt Hub e ao BI da ATR. Texto factual sobre o login; revisão jurídica pendente.
export const metadata = { title: 'Política de privacidade' };

const CONTACT = 'bruno.engenharia@atrincorporadora.com.br';

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 font-sans text-slate-700">
      <h1 className="text-2xl font-bold text-slate-900">Política de privacidade</h1>
      <p className="mt-1 text-sm text-slate-500">Sistemas ATR · login com Google · atualizada em 08/10/2026</p>

      <section className="mt-6 space-y-3 text-sm leading-relaxed">
        <p>
          Os sistemas internos da ATR Incorporadora (Obra 360, Takt Hub e BI da ATR) permitem entrar com uma conta Google. Esta
          página explica o que o Google compartilha nesse login e como esses dados são usados.
        </p>

        <h2 className="pt-2 text-base font-semibold text-slate-900">O que recebemos do Google</h2>
        <p>
          Somente o nome, o endereço de e-mail e a foto do perfil da conta Google escolhida. Não pedimos acesso a e-mails,
          arquivos, agenda nem a qualquer outro dado da conta.
        </p>

        <h2 className="pt-2 text-base font-semibold text-slate-900">Para que usamos</h2>
        <p>
          Para identificar quem está entrando, conferir se a pessoa tem acesso cadastrado e registrar a autoria das alterações
          feitas nos sistemas. Os dados não são vendidos nem compartilhados com terceiros para outros fins.
        </p>

        <h2 className="pt-2 text-base font-semibold text-slate-900">Onde ficam</h2>
        <p>
          Nos provedores que hospedam os sistemas: Supabase (banco de dados e autenticação) e Vercel (aplicação). O acesso aos
          dados é restrito às pessoas autorizadas pela ATR.
        </p>

        <h2 className="pt-2 text-base font-semibold text-slate-900">Seus direitos</h2>
        <p>
          Você pode pedir a consulta, a correção ou a exclusão dos seus dados de acesso pelo e-mail{' '}
          <a className="font-medium text-primary underline" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
          . Também é possível revogar o acesso a qualquer momento em{' '}
          <a className="font-medium text-primary underline" href="https://myaccount.google.com/connections">
            myaccount.google.com/connections
          </a>
          .
        </p>
      </section>

      <p className="mt-8 text-sm">
        <Link className="font-medium text-primary underline" href="/login">
          Voltar ao login
        </Link>
      </p>
    </main>
  );
}
