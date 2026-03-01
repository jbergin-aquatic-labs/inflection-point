using System.Threading.Tasks;
using PrinciPal.Common.Options;

namespace PrinciPal.Common.Extensions;

public static class OptionAsyncExtensions
{
    extension<T>(Task<Option<T>> optionTask)
    {
        public async Task<TResult> Match<TResult>(Func<T, TResult> some, Func<TResult> none)
        {
            var option = await optionTask.ConfigureAwait(false);
            return option.Match(some, none);
        }

        public async Task<Option<TResult>> Map<TResult>(Func<T, TResult> map)
        {
            var option = await optionTask.ConfigureAwait(false);
            return option.Map(map);
        }

        public async Task<Option<TResult>> Bind<TResult>(Func<T, Option<TResult>> bind)
        {
            var option = await optionTask.ConfigureAwait(false);
            return option.Bind(bind);
        }

        public async Task<Option<TResult>> Bind<TResult>(Func<T, Task<Option<TResult>>> bind)
        {
            var option = await optionTask.ConfigureAwait(false);
            return option.IsSome
                ? await bind(option.Match(v => v, () => default!)).ConfigureAwait(false)
                : Option<TResult>.None;
        }
    }

    extension<T>(Option<T> option)
    {
        public async Task<Option<TResult>> Bind<TResult>(Func<T, Task<Option<TResult>>> bind)
        {
            return option.IsSome
                ? await bind(option.Match(v => v, () => default!)).ConfigureAwait(false)
                : Option<TResult>.None;
        }
    }
}
