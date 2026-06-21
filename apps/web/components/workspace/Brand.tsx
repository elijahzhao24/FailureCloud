import Link from "next/link";

export default function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link className="fc-brand" href={href} aria-label="FailureCloud home">
      <svg
        aria-hidden="true"
        className="fc-brand__mark"
        viewBox="0 0 32 32"
      >
        <path d="M5 7.5h22L23.7 13H8.3L5 7.5Z" />
        <path d="M8.6 15h12.8l-3.3 5.5h-6.2L8.6 15Z" />
        <path d="M12.2 22.5h4.6L14.5 26l-2.3-3.5Z" />
      </svg>
      <span>FailureCloud</span>
    </Link>
  );
}
