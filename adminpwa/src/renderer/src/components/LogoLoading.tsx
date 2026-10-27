import logoAk from '../assets/an_khang_home_logo.png';

interface LogoLoadingProps {
  message?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClass = {
  sm: 'h-11 w-11',
  md: 'h-16 w-16',
  lg: 'h-20 w-20',
};

const minHeightClass = {
  sm: 'min-h-28',
  md: 'min-h-44',
  lg: 'min-h-56',
};

export const LogoLoading = ({
  message = 'Đang tải dữ liệu...',
  className = '',
  size = 'md',
}: LogoLoadingProps) => (
  <div className={`flex flex-col items-center justify-center gap-3 text-center text-gray-400 ${minHeightClass[size]} ${className}`}>
    <div className="relative">
      <div className="absolute inset-0 rounded-2xl bg-primary/25 blur-lg animate-pulse" />
      <img
        src={logoAk}
        alt="AK"
        className={`relative rounded-2xl object-contain shadow-md animate-pulse ${sizeClass[size]}`}
      />
    </div>
    <div className="flex items-center justify-center gap-1">
      <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.24s]" />
      <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.12s]" />
      <span className="h-2 w-2 rounded-full bg-primary animate-bounce" />
    </div>
    {message && <div className="text-sm font-semibold text-slate-500">{message}</div>}
  </div>
);
